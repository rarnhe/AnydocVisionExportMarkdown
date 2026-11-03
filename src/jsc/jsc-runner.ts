import { generateJscPolyfills } from './polyfills';

/** Generate one JSC process for the entire batch; initialize WASM once. */
export function buildJscKernelScript(wasmB64:string, glueCode:string, files:{path:string;pdfB64:string}[]):string {
  return [
    generateJscPolyfills(), glueCode,
    '(function(){',
    'try {',
    'var wasmBytes=b64ToUint8Array('+JSON.stringify(wasmB64)+');',
    'var inputs='+JSON.stringify(files)+';',
    'var wasmModule=new WebAssembly.Module(wasmBytes.buffer);',
    'var glue=typeof WasmGlue!=="undefined"?WasmGlue:{};',
    'if(typeof glue.initSync==="function") glue.initSync({module:wasmModule});',
    'else if(typeof glue.default==="function" && typeof glue.default.initSync==="function") glue.default.initSync({module:wasmModule});',
    'else if(typeof glue==="function") glue(wasmBytes);',
    'else {var instance=new WebAssembly.Instance(wasmModule,{"./anydoc_wasm_bg.js":glue});if(typeof glue.__wbg_set_wasm==="function")glue.__wbg_set_wasm(instance.exports);}',
    'var convert=glue.toMarkdownBytes||glue.to_markdown_bytes||glue.toMarkdown||glue.to_markdown||(glue.default&&(glue.default.toMarkdownBytes||glue.default.to_markdown_bytes));',
    'if(typeof convert!=="function")throw new Error("Conversion function not found");',
    'print("BATCH_INIT_OK");',
    'for(var i=0;i<inputs.length;i++){',
    'try {var bytes=b64ToUint8Array(inputs[i].pdfB64);var result=convert(bytes,"pdf");',
    'var md=typeof result==="string"?result:new TextDecoder("utf-8").decode(new Uint8Array(result));',
    'print("BATCH_RESULT:"+i+":"+btoa(unescape(encodeURIComponent(md))));',
    '}catch(e){print("BATCH_ERROR:"+i+":"+String(e.stack||e));}',
    '}',
    '}catch(e){print("BATCH_FATAL:"+String(e.stack||e));}',
    '})();'
  ].join('\n');
}
