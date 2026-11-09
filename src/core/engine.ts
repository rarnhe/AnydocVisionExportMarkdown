import { installAnyDocPolyfills } from "../shared/polyfills";

export interface AnyDocAssets {
  readonly wasmBytes: Uint8Array;
  readonly glueCode: string;
}

interface AnyDocGlue {
  initSync?: (options: {module: WebAssembly.Module}) => unknown;
  default?: {initSync?: (options: {module: WebAssembly.Module}) => unknown;
             toMarkdownBytes?: (bytes: Uint8Array, type: string) => Uint8Array | string};
  toMarkdownBytes?: (bytes: Uint8Array, type: string) => Uint8Array | string;
  to_markdown_bytes?: (bytes: Uint8Array, type: string) => Uint8Array | string;
}

export class AnyDocEngine {
  private readonly convertFn: (bytes: Uint8Array, type: string) => Uint8Array | string;

  constructor(assets: AnyDocAssets) {
    installAnyDocPolyfills();
    // TS 5.9 DOM BufferSource excludes Uint8Array<ArrayBufferLike>; create a real ArrayBuffer-backed view.
    const wasmBytes = new Uint8Array(new ArrayBuffer(assets.wasmBytes.length));
    wasmBytes.set(assets.wasmBytes);
    if (typeof WebAssembly === "undefined" || !WebAssembly.validate(wasmBytes)) {
      throw new Error("Actual AnyDoc WebAssembly module is invalid or unavailable");
    }
    // Convert wasm-bindgen ESM to IIFE at build time; evaluate the same glue in Node and JXA.
    // Assets are from the pinned trusted npm package, NEVER from untrusted user input.
    const glue = new Function(assets.glueCode + "\nreturn WasmGlue;")() as AnyDocGlue;
    const init = glue.initSync || glue.default?.initSync;
    if (typeof init !== "function") throw new Error("AnyDoc wasm-bindgen initSync missing");
    const module = new WebAssembly.Module(wasmBytes);
    // wasm-bindgen initializes the instance and connects imports to the glue.
    init.call(glue.initSync ? glue : glue.default, {module});
    const convert = glue.toMarkdownBytes || glue.to_markdown_bytes || glue.default?.toMarkdownBytes;
    if (typeof convert !== "function") throw new Error("AnyDoc toMarkdownBytes export missing");
    this.convertFn = convert;
  }

  convert(bytes: Uint8Array, type: string): string {
    if (type === "pdf" && (bytes.length < 5 || String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-")) {
      throw new Error("Input is not a PDF");
    }
    const result = this.convertFn(bytes, type);
    const markdown = typeof result === "string"
      ? result
      : new TextDecoder("utf-8").decode(new Uint8Array(result));
    if (markdown.trim().length < 30) throw new Error("Converted Markdown empty or too short");
    return markdown;
  }

  convertPdf(bytes: Uint8Array): string { return this.convert(bytes, "pdf"); }
}

let singleton: AnyDocEngine | undefined;
let initializationCount = 0;

/** Exactly one compiled WASM + wasm-bindgen instance per running process. */
export function getAnyDocSingleton(assets: AnyDocAssets): AnyDocEngine {
  if (!singleton) {
    singleton = new AnyDocEngine(assets);
    initializationCount += 1;
  }
  return singleton;
}

export function getWasmInitializationCount(): number {
  return initializationCount;
}
