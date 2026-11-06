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
require("tsx/cjs");
const {wasmBytes, glueCode} = require("./src/hosts/node-assets.ts").loadPackageAssets();

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
    "__EMBEDDED_WASM_B64__": JSON.stringify(Buffer.from(wasmBytes).toString("base64")),
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
