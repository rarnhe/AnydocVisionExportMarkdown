import { generateJscPolyfills } from './polyfills';

/**
 * 构建传输给系统底层 /.../jsc 引擎执行的纯净 WASM 内核驱动脚本
 */
export function buildJscKernelScript(wasmB64: string, glueCodeStr: string, pdfB64: string): string {
  return [
    generateJscPolyfills(),
    glueCodeStr,
    "(function() {",
    "  try {",
    "    var wasmB64 = " + JSON.stringify(wasmB64) + ";",
    "    var pdfB64 = " + JSON.stringify(pdfB64) + ";",
    "    var wasmBytes = b64ToUint8Array(wasmB64);",
    "    var pdfBytes = b64ToUint8Array(pdfB64);",
    "",
    "    var wasmModule = new WebAssembly.Module(wasmBytes.buffer);",
    "    var glue = typeof WasmGlue !== 'undefined' ? WasmGlue : {};",
    "",
    "    if (typeof glue.initSync === 'function') {",
    "      glue.initSync({ module: wasmModule });",
    "    } else if (typeof glue.default === 'function' && typeof glue.default.initSync === 'function') {",
    "      glue.default.initSync({ module: wasmModule });",
    "    } else if (typeof glue === 'function') {",
    "      glue(wasmBytes);",
    "    } else {",
    "      var instance = new WebAssembly.Instance(wasmModule, { './anydoc_wasm_bg.js': glue });",
    "      if (typeof glue.__wbg_set_wasm === 'function') { glue.__wbg_set_wasm(instance.exports); }",
    "    }",
    "",
    "    var convertFn = glue.toMarkdownBytes || glue.to_markdown_bytes || glue.toMarkdown || glue.to_markdown || (glue.default && (glue.default.toMarkdownBytes || glue.default.to_markdown_bytes));",
    "    if (typeof convertFn !== 'function') { throw new Error('未能在胶水层中找到转换方法'); }",
    "",
    "    var rawResult = convertFn(pdfBytes, 'pdf');",
    "    var mdResult = typeof rawResult === 'string' ? rawResult : new TextDecoder('utf-8').decode(new Uint8Array(rawResult));",
    "",
    "    print('MARKDOWN_OUTPUT_START');",
    "    print(mdResult);",
    "    print('MARKDOWN_OUTPUT_END');",
    "  } catch (e) {",
    "    print('ERROR: ' + (e.stack || e.message || e));",
    "  }",
    "})();"
  ].join('\n');
}