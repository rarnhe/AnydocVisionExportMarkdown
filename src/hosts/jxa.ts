import {recoverWithCocoaPdfKit,recoverImageWithVision} from "../adapters/cocoa-ocr";
import { decodeBase64 } from "../shared/base64";
import { processInputs } from "../core/processor";
import { createCocoaFilePort } from "../adapters/cocoa-fs";

/** Replaced with package bytes and esbuild-transformed glue by root build.js. */
declare const __EMBEDDED_WASM_B64__: string;
declare const __EMBEDDED_GLUE_CODE__: string;

export function run(argv: string[] = []): string {
  const assets = {
    wasmBytes: decodeBase64(__EMBEDDED_WASM_B64__),
    glueCode: __EMBEDDED_GLUE_CODE__
  };
  const result = processInputs(Array.from(argv), createCocoaFilePort(), assets, "JXA",
    (input,request,engine)=>request
      ? recoverWithCocoaPdfKit(input,request,engine!)
      : recoverImageWithVision(input));
  return JSON.stringify(result, null, 2);
}
