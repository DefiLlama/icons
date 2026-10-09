const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const sharp = require("sharp");

const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/utils/image-resize.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const dependencies = {
  dotenv: { config() {} },
  fs,
  path,
  sharp,
  "./cache-client": { getCache: async () => null, setCache: async () => {}, sluggify: value => value },
  "./cache-control-helper": {},
  "./async-timeout": { fetchBufferWithTimeout: async () => { throw new Error("Unexpected external image fetch"); } },
};
const loadedModule = { exports: {} };
vm.runInNewContext(source, {
  module: loadedModule,
  exports: loadedModule.exports,
  console,
  Buffer,
  URL,
  require: name => {
    assert(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  },
});

for (const slug of ["derive-v3-perps", "derive-v3-options", "derive-v3-spot"]) {
  test(`${slug} serves the existing Derive artwork at original and listing sizes`, async () => {
    const assetsRoot = path.join(__dirname, "../assets/protocols");
    assert.deepEqual(fs.readFileSync(path.join(assetsRoot, `${slug}.png`)), fs.readFileSync(path.join(assetsRoot, "derive.png")));
    for (const suffix of ["", "?w=48&h=48"]) {
      const request = { protocol: "http", get: () => "localhost", originalUrl: `/icons/protocols/${slug}${suffix}`, params: { category: "protocols", name: slug } };
      const response = {
        statusCode: 200,
        status(value) { this.statusCode = value; return this; },
        set(value) { this.headers = value; return this; },
        send(value) { this.payload = value; return this; },
      };
      await loadedModule.exports.handleImageResize(request, response);
      assert.equal(response.statusCode, 200);
      assert.equal(response.headers["Content-Type"], "image/webp");
      const metadata = await sharp(response.payload).metadata();
      assert.equal(metadata.width, suffix ? 48 : 400);
      assert.equal(metadata.height, suffix ? 48 : 400);
    }
  });
}
