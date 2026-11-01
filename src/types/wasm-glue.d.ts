export interface WasmGlueModule {
  initSync?(opts: { module: WebAssembly.Module }): void;
  toMarkdownBytes?(bytes: Uint8Array, type: string): Uint8Array | string;
  to_markdown_bytes?(bytes: Uint8Array, type: string): Uint8Array | string;
  toMarkdown?(bytes: Uint8Array, type: string): Uint8Array | string;
  to_markdown?(bytes: Uint8Array, type: string): Uint8Array | string;
  default?: WasmGlueModule;
}

declare global {
  var WasmGlue: WasmGlueModule;
  var __STATIC_WASM_B64__: string;
  var __STATIC_GLUE_CODE__: string;
}