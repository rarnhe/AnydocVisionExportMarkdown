import * as fs from "node:fs";
import * as path from "node:path";
import * as esbuild from "esbuild";
import type { AnyDocAssets } from "../core/engine";

/**
 * Node-only source of truth for package discovery, WASM validation and
 * wasm-bindgen glue transformation. Imported by build.js through tsx/cjs.
 * Never reachable from the JXA bundle entry point.
 */
export function loadPackageAssets(): AnyDocAssets {
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
