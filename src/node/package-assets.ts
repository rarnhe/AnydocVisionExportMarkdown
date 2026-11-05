import * as fs from "node:fs";
import * as path from "node:path";
import * as esbuild from "esbuild";
import type { AnyDocAssets } from "../core/anydoc-engine";

/** The same assets/discovery/transform policy used by root build.js. */
export function loadPackageAssets(): AnyDocAssets {
  const packageDir = path.dirname(require.resolve("@firecrawl/anydoc-wasm"));
  const wasmPath = path.join(packageDir, "anydoc_wasm_bg.wasm");
  const gluePath = ["anydoc_wasm.js", "anydoc_wasm_bg.js"]
    .map(name => path.join(packageDir, name))
    .find(candidate => fs.existsSync(candidate));
  if (!gluePath) throw new Error("AnyDoc wasm-bindgen JS glue was not found");
  const wasmBytes = new Uint8Array(fs.readFileSync(wasmPath));
  const glueCode = esbuild.transformSync(fs.readFileSync(gluePath, "utf8"), {
    loader: "js", target: "es2020", format: "iife", globalName: "WasmGlue"
  }).code;
  return {wasmBytes, glueCode};
}
