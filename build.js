#!/usr/bin/env node
"use strict";
/*
 * Build a standalone macOS JXA script:
 * - Node/esbuild used ONLY at build time;
 * - all application source under src/ is TypeScript;
 * - AnyDoc WASM and wasm-bindgen glue embedded at compile time;
 * - no runtime Node, JSC, NSTask or subprocess.
 */
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const root = __dirname;
const pkgDir = path.dirname(require.resolve("@firecrawl/anydoc-wasm"));
const wasmPath = path.join(pkgDir, "anydoc_wasm_bg.wasm");
const gluePath = ["anydoc_wasm.js", "anydoc_wasm_bg.js"]
  .map(name => path.join(pkgDir, name)).find(fs.existsSync);
if (!gluePath) throw new Error("AnyDoc wasm-bindgen glue not found");
const wasmBytes = fs.readFileSync(wasmPath);
if (wasmBytes.subarray(0, 4).toString("hex") !== "0061736d") {
  throw new Error("Unexpected WASM magic");
}
const glueCode = esbuild.transformSync(fs.readFileSync(gluePath, "utf8"), {
  loader: "js",
  target: "es2020",
  format: "iife",
  globalName: "WasmGlue"
}).code;

const outFile = path.join(root, "dist", "anydoc-wasm.jxa.js");
fs.mkdirSync(path.dirname(outFile), {recursive: true});
esbuild.buildSync({
  entryPoints: [path.join(root, "src", "hosts", "jxa.ts")],
  bundle: true,
  platform: "neutral",
  format: "iife",
  globalName: "JxaAnyDoc",
  target: "es2020",
  outfile: outFile,
  banner: {js: "#!/usr/bin/osascript -l JavaScript"},
  footer: {js: "\nfunction run(argv) { return JxaAnyDoc.run(argv); }\n"},
  define: {
    "__EMBEDDED_WASM_B64__": JSON.stringify(wasmBytes.toString("base64")),
    "__EMBEDDED_GLUE_CODE__": JSON.stringify(glueCode)
  },
  logLevel: "info"
});
fs.chmodSync(outFile, 0o755);
console.log(JSON.stringify({
  artifact: "dist/anydoc-wasm.jxa.js",
  wasmBytes: wasmBytes.length,
  glueBytes: Buffer.byteLength(glueCode),
  bundleBytes: fs.statSync(outFile).size,
  jsc: false,
  runtimeDependencies: []
}));
