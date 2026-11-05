/* Common real-world AnyDoc WASM execution kernel for JXA and Node validation.
 * Generated scripts inject WASM and PDF base64 plus esbuild-transformed wasm-bindgen glue.
 * The JXA runtime never starts JSC, Node, or another subprocess.
 */
function anydocBase64ToBytes(input) {
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var clean = String(input).replace(/\s/g, "");
  if (clean.length % 4 !== 0) throw Error("invalid base64 length");
  var pad = clean.slice(-2) === "==" ? 2 : clean.slice(-1) === "=" ? 1 : 0;
  var bytes = new Uint8Array(clean.length / 4 * 3 - pad);
  var pos = 0;
  for (var i = 0; i < clean.length; i += 4) {
    var a = chars.indexOf(clean.charAt(i));
    var b = chars.indexOf(clean.charAt(i + 1));
    var c = clean.charAt(i + 2) === "=" ? 0 : chars.indexOf(clean.charAt(i + 2));
    var d = clean.charAt(i + 3) === "=" ? 0 : chars.indexOf(clean.charAt(i + 3));
    if (a < 0 || b < 0 || c < 0 || d < 0) throw Error("invalid base64 alphabet");
    var value = (a << 18) | (b << 12) | (c << 6) | d;
    bytes[pos++] = (value >>> 16) & 255;
    if (pos < bytes.length) bytes[pos++] = (value >>> 8) & 255;
    if (pos < bytes.length) bytes[pos++] = value & 255;
  }
  return bytes;
}
function anydocRuntime(variant) {
  var state = {
    schema: 1, engine: variant, phase: "start", success: false,
    wasm_global: typeof WebAssembly, objc_global: typeof ObjC,
    mode: "in-process (no NSTask/osascript/child_process)",
    wasm_valid: null, wasm_size: 0, pdf_size: 0,
    glue_init: "not_called", wasm_instance: "not_created",
    converter: "not_called", markdown: "", message: ""
  };
  try {
    state.phase = "decode_wasm_and_pdf";
    var wasmBytes = anydocBase64ToBytes(__ANYDOC_WASM_B64__);
    var pdfBytes = anydocBase64ToBytes(__ANYDOC_PDF_B64__);
    state.wasm_size = wasmBytes.length;
    state.pdf_size = pdfBytes.length;
    if (String.fromCharCode(pdfBytes[0],pdfBytes[1],pdfBytes[2],pdfBytes[3],pdfBytes[4]) !== "%PDF-") {
      throw Error("PDF header mismatch");
    }
    state.phase = "validate_real_wasm";
    state.wasm_valid = WebAssembly.validate(wasmBytes);
    state.phase = "compile_real_wasm";
    var wasmModule = new WebAssembly.Module(wasmBytes);
    state.phase = "initialize_wasm_bindgen_glue";
    if (typeof WasmGlue === "undefined") throw Error("WasmGlue missing");
    if (typeof WasmGlue.initSync === "function") {
      WasmGlue.initSync({module: wasmModule});
      state.glue_init = "WasmGlue.initSync(module)";
    } else if (WasmGlue.default && typeof WasmGlue.default.initSync === "function") {
      WasmGlue.default.initSync({module: wasmModule});
      state.glue_init = "WasmGlue.default.initSync(module)";
    } else {
      throw Error("No wasm-bindgen initSync export found");
    }
    state.wasm_instance = "initialized by wasm-bindgen";
    state.phase = "resolve_markdown_converter";
    var fn = WasmGlue.toMarkdownBytes || WasmGlue.to_markdown_bytes ||
      (WasmGlue.default && WasmGlue.default.toMarkdownBytes);
    if (typeof fn !== "function") throw Error("No toMarkdownBytes export found");
    state.phase = "convert_pdf";
    state.converter = "toMarkdownBytes";
    var converted = fn(pdfBytes, "pdf");
    state.phase = "decode_markdown";
    if (typeof converted === "string") {
      state.markdown = converted;
    } else {
      state.markdown = new TextDecoder("utf-8").decode(new Uint8Array(converted));
    }
    if (state.markdown.trim().length < 30) throw Error("Markdown too short");
    state.phase = "done";
    state.success = true;
  } catch (e) {
    state.message = String(e && (e.message || e)) + (e && e.stack ? ' | stack: ' + String(e.stack) : '');
  }
  return "ANYDOC_RESULT_JSON=" + JSON.stringify(state);
}
