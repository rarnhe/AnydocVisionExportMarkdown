"use strict";
/**
 * Single Node-only AnyDoc asset loader used by both TSX development and
 * build.js. Never imported by the JXA entry point or bundled into JXA.
 */
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

function loadPackageAssets() {
  const packageDir = path.dirname(require.resolve("@firecrawl/anydoc-wasm"));
  const wasmPath = path.join(packageDir, "anydoc_wasm_bg.wasm");
  const gluePath = ["anydoc_wasm.js", "anydoc_wasm_bg.js"]
    .map(name => path.join(packageDir, name))
    .find(candidate => fs.existsSync(candidate));
  if (!gluePath) throw new Error("AnyDoc wasm-bindgen glue was not found");
  const wasmBytes = new Uint8Array(fs.readFileSync(wasmPath));
  if (wasmBytes.length < 8 || wasmBytes[0] !== 0 || wasmBytes[1] !== 97 ||
      wasmBytes[2] !== 115 || wasmBytes[3] !== 109) {
    throw new Error("Unexpected AnyDoc WASM magic");
  }
  const glueCode = esbuild.transformSync(fs.readFileSync(gluePath, "utf8"), {
    loader: "js", target: "es2020", format: "iife", globalName: "WasmGlue"
  }).code;
  return {wasmBytes, glueCode};
}
module.exports = {loadPackageAssets};
