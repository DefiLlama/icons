const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, dependencies) {
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { 
      module: ts.ModuleKind.CommonJS, 
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(source, { module, exports: module.exports, console, path, URL,
    require: name => {
      if (!(name in dependencies)) {
        if (name === "path") return path;
        if (name === "fs") return fs;
        throw new Error(`Unexpected dependency: ${name}`);
      }
      return dependencies[name];
    },
  });
  return module.exports;
}

function makeReqRes() {
  const req = { 
    params: {}, 
    originalUrl: '/icons/protocols/test', 
    protocol: 'https', 
    get: (header) => header === 'host' ? 'localhost' : undefined 
  };
  const res = { 
    statusCode: 200, 
    status(code) { this.statusCode = code; return this; },
    send(msg) { this.body = msg; return this; },
    set() { return this; }
  };
  return { req, res };
}

const sluggify = (input) => {
  const slug = decodeURIComponent(input)
    .toLowerCase()
    .replace(/[^\w\/]+/g, "-");
  return slug.replace(/^-+/, "").replace(/-+$/, "");
};

const sharpMock = function(buffer) {
  return {
    metadata: async () => ({ format: "png" }),
    resize() { return this; },
    toBuffer: async () => Buffer.from("mock image"),
    gif() { return this; },
    png() { return this; },
    webp() { return this; },
  };
};
sharpMock.fit = { contain: "contain", cover: "cover", fill: "fill", inside: "inside", outside: "outside" };

test("handleImageResize rejects path traversal in name param", async () => {
  const { handleImageResize } = load("src/utils/image-resize.ts", {
    dotenv: { config: () => {} },
    express: { Request: class {}, Response: class {} },
    "sharp": sharpMock,
    "./cache-client": { 
      getCache: async () => null, 
      setCache: async () => {}, 
      sluggify 
    },
    "./cache-control-helper": { MAX_AGE_1_YEAR: "1y", MAX_AGE_4_HOURS: "4h", MAX_AGE_10_MINUTES: "10m" },
    "./async-timeout": { fetchBufferWithTimeout: async () => ({ buffer: Buffer.from(""), contentType: "image/png", ok: true, status: 200 }) },
    "path": path,
    "fs": { readdirSync: () => [] }
  });

  const { req, res } = makeReqRes();

  // A valid name should reach the image handler and return a resized image response.
  req.params = { category: 'protocols', name: 'valid-name' };
  await handleImageResize(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, Buffer.from("mock image"));

  // Path traversal attempts (decoded, as Express would provide them)
  const traversalAttempts = [
    '..',
    '../..',
    '../..',  // ..%2F.. decoded
    '../../etc/passwd',  // ..%2F..%2Fetc%2Fpasswd decoded
    '..\\..\\windows',
    'valid/../traversal',
    '.',
    '',
  ];

  for (const name of traversalAttempts) {
    const { req, res } = makeReqRes();
    req.params = { category: 'protocols', name };
    await handleImageResize(req, res);
    assert.equal(res.statusCode, 400, `Expected 400 for name="${name}", got ${res.statusCode}`);
    assert.equal(res.body, "BAD REQUEST");
  }
});

test("handleImageResize rejects invalid category", async () => {
  const { handleImageResize } = load("src/utils/image-resize.ts", {
    dotenv: { config: () => {} },
    express: { Request: class {}, Response: class {} },
    "sharp": sharpMock,
    "./cache-client": { 
      getCache: async () => null, 
      setCache: async () => {}, 
      sluggify 
    },
    "./cache-control-helper": { MAX_AGE_1_YEAR: "1y", MAX_AGE_4_HOURS: "4h", MAX_AGE_10_MINUTES: "10m" },
    "./async-timeout": { fetchBufferWithTimeout: async () => ({ buffer: Buffer.from(""), contentType: "image/png", ok: true, status: 200 }) },
    "path": path,
    "fs": { readdirSync: () => [] }
  });

  const { req, res } = makeReqRes();
  req.params = { category: 'invalid-category', name: 'test' };
  await handleImageResize(req, res);
  assert.equal(res.statusCode, 404);
});