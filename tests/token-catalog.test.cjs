const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, dependencies) {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, console,
    require: name => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return module.exports;
}

function setup(catalog) {
  const reader = load("src/utils/token-catalog.ts", {
    "@defillama/sdk": { cache: { readCache: async (key, options) => {
      assert.equal(key, "tokenlist/coingecko-catalog.json");
      assert.equal(options.readFromR2Cache, true);
      return catalog;
    } } },
  });
  return load("src/routes/token-list.ts", {
    "../utils/token-catalog": reader,
    "../utils/cache-client": {}, "../utils/cache-control-helper": {},
    "../utils/async-timeout": { fetchJsonWithTimeout: async url => {
      assert(!url.includes("tokenlist/"));
      return {};
    } },
  });
}

test("uses exact IDs for tokens sharing a logo and retains platform icons without logos", async () => {
  const { compileTokenList, compileGeckoLogoList } = setup({ schemaVersion: 2, coins: {
    first: { name: "First", logoURI: "https://coin-images.coingecko.com/shared.png", platforms: { ethereum: "0xAA" } },
    second: { name: "Second", logoURI: "https://coin-images.coingecko.com/shared.png", platforms: { base: "0xBB" } },
    noLogo: { name: "No Logo", platforms: { ethereum: "0xCC" } },
  } });
  const result = await compileTokenList();
  assert.equal(result.geckoPlatforms.first.length, 1);
  assert.equal(result.geckoPlatforms.first[0].tokenAddress, "0xaa");
  assert.equal(result.geckoPlatforms.second[0].chainId, 8453);
  assert.equal(result.geckoPlatforms.noLogo[0].tokenAddress, "0xcc");
  assert.equal(result.tokens[0].first, "https://assets.coingecko.com/shared.png");
  assert.equal((await compileGeckoLogoList()).first, result.gecko.first);
});

test("rejects missing or old catalog without legacy endpoint fallback", async () => {
  for (const catalog of [{}, { schemaVersion: 1, coins: {} }]) {
    const { compileTokenList, compileGeckoLogoList } = setup(catalog);
    await assert.rejects(compileTokenList(), /catalog schema 2/);
    await assert.rejects(compileGeckoLogoList(), /catalog schema 2/);
  }
});
