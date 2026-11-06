import { decodeBase64 } from "../shared/base64";
import { convertBatch } from "../core/batch";
import { createCocoaFilePort } from "../adapters/cocoa-fs";

/** Replaced with package bytes and esbuild-transformed glue by root build.js. */
declare const __EMBEDDED_WASM_B64__: string;
declare const __EMBEDDED_GLUE_CODE__: string;

export function run(argv: string[] = []): string {
  const assets = {
    wasmBytes: decodeBase64(__EMBEDDED_WASM_B64__),
    glueCode: __EMBEDDED_GLUE_CODE__
  };
  const result = convertBatch(Array.from(argv), createCocoaFilePort(), assets, "JXA");
  return "ANYDOC_BATCH_JSON=" + JSON.stringify(result);
}
