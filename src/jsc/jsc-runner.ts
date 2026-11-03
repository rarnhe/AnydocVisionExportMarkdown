import { generateJscPolyfills } from './polyfills';

/**
 * One long-lived JSC process: initialize WASM once, then read one PDF payload
 * per stdin line. The WASM API accepts bytes, not filesystem paths.
 */
export function buildJscKernelScript(wasmB64:string, glueCode:string, fileCount:number):string {
  return [
    generateJscPolyfills(), glueCode,
    '(function(){',
    'try {',
    'var wasmBytes=b64ToUint8Array('+JSON.stringify(wasmB64)+');',
    'var wasmModule=new WebAssembly.Module(wasmBytes.buffer);',
    'var glue=typeof WasmGlue!=="undefined"?WasmGlue:{};',
    'if(typeof glue.initSync==="function") glue.initSync({module:wasmModule});',
    'else if(typeof glue.default==="function" && typeof glue.default.initSync==="function") glue.default.initSync({module:wasmModule});',
    'else if(typeof glue==="function") glue(wasmBytes);',
    'else {var instance=new WebAssembly.Instance(wasmModule,{"./anydoc_wasm_bg.js":glue});if(typeof glue.__wbg_set_wasm==="function")glue.__wbg_set_wasm(instance.exports);}',
    'var convert=glue.toMarkdownBytes||glue.to_markdown_bytes||glue.toMarkdown||glue.to_markdown||(glue.default&&(glue.default.toMarkdownBytes||glue.default.to_markdown_bytes));',
    'if(typeof convert!=="function")throw new Error("Conversion function not found");',
    'print("BATCH_INIT_OK");',
    'for(var i=0;i<'+fileCount+';i++){',
    'try {',
    'var pdfB64=readline();',
    'if(pdfB64===null||pdfB64===undefined)throw new Error("Missing PDF bytes on stdin");',
    'var bytes=b64ToUint8Array(pdfB64);',
    'var result=convert(bytes,"pdf");',
    'var md=typeof result==="string"?result:new TextDecoder("utf-8").decode(new Uint8Array(result));',
    'print("BATCH_RESULT:"+i+":"+encodeURIComponent(md));',
    '}catch(e){print("BATCH_ERROR:"+i+":"+String(e.stack||e));}',
    '}',
    '}catch(e){print("BATCH_FATAL:"+String(e.stack||e));}',
    '})();'
  ].join('\n');
}
