const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const sharp = require("sharp");

function loadHandler() {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/utils/image-resize.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const dependencies = {
    dotenv: { config: () => {} },
    fs,
    path,
    sharp,
    "./cache-client": { getCache: async () => null, setCache: async () => {}, sluggify: value => value },
    "./cache-control-helper": { MAX_AGE_1_YEAR: "max-age=31536000", MAX_AGE_4_HOURS: "max-age=14400" },
    "./async-timeout": { fetchBufferWithTimeout: async () => { throw new Error("Unexpected network request"); } },
  };
  vm.runInNewContext(source, {
    module, exports: module.exports, console, URL, Buffer,
    require: name => {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return module.exports.handleImageResize;
}

for (const [category, name] of [["protocols", "picnic"], ["protocols", "ruvo"], ["crypto-cards", "picnic"], ["crypto-cards", "ruvo"]]) {
  test(`${category}/${name} serves a decodable 48px card logo`, async () => {
    const handler = loadHandler();
    const request = {
      protocol: "https",
      get: () => "icons.llamao.fi",
      originalUrl: `/icons/${category}/${name}?w=48&h=48`,
      params: { category, name },
    };
    const response = {
      statusCode: null,
      headers: {},
      payload: null,
      status(value) { this.statusCode = value; return this; },
      set(value) { Object.assign(this.headers, value); return this; },
      send(value) { this.payload = value; return this; },
    };

    await handler(request, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["Content-Type"], "image/webp");
    const metadata = await sharp(response.payload).metadata();
    assert.equal(metadata.width, 48);
    assert.equal(metadata.height, 48);
  });
}

test("card logo assets reuse the matching protocol artwork", () => {
  for (const [name, extension] of [["picnic", "jpg"], ["ruvo", "png"]]) {
    const protocol = fs.readFileSync(path.join(__dirname, `../assets/protocols/${name}.${extension}`));
    const card = fs.readFileSync(path.join(__dirname, `../assets/crypto-cards/${name}.${extension}`));
    assert.deepEqual(card, protocol);
  }
});
