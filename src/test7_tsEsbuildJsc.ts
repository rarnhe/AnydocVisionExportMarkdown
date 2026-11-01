#!/usr/bin/env ts-node
//这个文件采用硬编码写入了wasm的胶水函数，因为wasm新版本发布，胶水函数会发生变化，所以健壮性不高
// JXA 环境类型声明 (用于防止 TypeScript 编译警告)
declare const ObjC: any;
declare const $: any;

// =============================================================================
// 1. JXA 运行入口 (纯净代码，绝对不能依赖 Node.js 内置模块)
// =============================================================================
function runJxaLogic(): void {
  // 导入 macOS Foundation 框架
  if (typeof ObjC !== 'undefined' && typeof ObjC.import === 'function') {
    ObjC.import('Foundation');
  }

  // 1.1 从 NSProcessInfo 提取 CLI 参数
  const processInfo = $.NSProcessInfo.processInfo;
  const rawArgs = ObjC.unwrap(processInfo.arguments);
  const jsArgs: string[] = [];

  let separatorFound = false;
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = ObjC.unwrap(rawArgs[i]);
    if (separatorFound) {
      jsArgs.push(arg);
    } else if (arg === '--') {
      separatorFound = true;
    }
  }

  const wasmPath = jsArgs[1] || "/Users/xu/Developer/smallTools/exportMarkdown_ts/node_modules/@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm";
  const pdfPath = jsArgs[2] || "/Users/xu/Desktop/chunk_1.pdf";
  const outputPath = pdfPath.replace(/\.pdf$/i, ".md");

  console.log("==================================================");
  console.log("=== JXA + JSC 自动化转换 PDF 到 Markdown ===");
  console.log("==================================================");
  console.log("📄 PDF 源文件: " + pdfPath);
  console.log("⚙️ WASM 模块: " + wasmPath);

  // 1.2 校验文件存在性
  const fm = $.NSFileManager.defaultManager;
  const nsPdfPath = $.NSString.stringWithString(pdfPath);
  const nsWasmPath = $.NSString.stringWithString(wasmPath);

  if (!fm.fileExistsAtPath(nsPdfPath)) {
    throw new Error("❌ PDF 文件不存在: " + pdfPath);
  }
  if (!fm.fileExistsAtPath(nsWasmPath)) {
    throw new Error("❌ WASM 文件不存在: " + wasmPath);
  }

  // 1.3 读取文件并转换为 Base64 (使用 JXA 兼容的 NSData API)
  const pdfData = $.NSData.dataWithContentsOfFile(nsPdfPath);
  const wasmData = $.NSData.dataWithContentsOfFile(nsWasmPath);

  const pdfB64 = ObjC.unwrap(pdfData.base64EncodedStringWithOptions(0));
  const wasmB64 = ObjC.unwrap(wasmData.base64EncodedStringWithOptions(0));

  console.log("✅ 读取文件成功 (PDF: " + ObjC.unwrap(pdfData.length) + " 字节, WASM: " + ObjC.unwrap(wasmData.length) + " 字节)");

  // 1.4 构造 JSC 评估胶水脚本
  const tmpScriptPath = "/tmp/anydoc_runner_" + Date.now() + ".js";

  const workerScript = [
    "if (typeof TextDecoder === 'undefined') {",
    "  function TextDecoder() {}",
    "  TextDecoder.prototype.decode = function(bytes) {",
    "    if (!bytes || !bytes.length) return '';",
    "    var str = '';",
    "    for (var i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);",
    "    try { return decodeURIComponent(escape(str)); } catch(e) { return str; }",
    "  };",
    "}",
    "if (typeof TextEncoder === 'undefined') {",
    "  function TextEncoder() {}",
    "  TextEncoder.prototype.encode = function(str) {",
    "    var utf8 = unescape(encodeURIComponent(str || ''));",
    "    var result = new Uint8Array(utf8.length);",
    "    for (var i = 0; i < utf8.length; i++) result[i] = utf8.charCodeAt(i);",
    "    return result;",
    "  };",
    "}",
    "if (typeof globalThis === 'undefined') { var globalThis = this; }",
    "if (typeof crypto === 'undefined') {",
    "  globalThis.crypto = {",
    "    getRandomValues: function(arr) {",
    "      for (var i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);",
    "      return arr;",
    "    }",
    "  };",
    "}",
    "function b64ToUint8Array(b64) {",
    "  var binStr = atob(b64);",
    "  var bytes = new Uint8Array(binStr.length);",
    "  for (var i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);",
    "  return bytes;",
    "}",
    "var wasmModule, wasmInstance, wasm;",
    "var heap = new Array(1024).fill(undefined);",
    "heap.push(undefined, null, true, false);",
    "var heap_next = heap.length;",
    "var WASM_VECTOR_LEN = 0;",
    "var cachedDataViewMemory0 = null;",
    "var cachedUint8ArrayMemory0 = null;",
    "var __wbindgen_enum_Format = ['doc', 'docx', 'odt', 'pdf', 'ppt', 'pptx', 'rtf', 'epub', 'xlsx', 'ods', 'odp', 'csv'];",
    "function addHeapObject(obj) { if (heap_next === heap.length) heap.push(heap.length + 1); const idx = heap_next; heap_next = heap[idx]; heap[idx] = obj; return idx; }",
    "function dropObject(idx) { if (idx < 1028) return; heap[idx] = heap_next; heap_next = idx; }",
    "function getObject(idx) { return heap[idx]; }",
    "function takeObject(idx) { const ret = getObject(idx); dropObject(idx); return ret; }",
    "function isLikeNone(x) { return x === undefined || x === null; }",
    "function handleError(f, args) { try { return f.apply(this, args); } catch (e) { wasm.__wbindgen_export3(addHeapObject(e)); } }",
    "function getUint8ArrayMemory0() { if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer); return cachedUint8ArrayMemory0; }",
    "function getDataViewMemory0() { if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) { cachedDataViewMemory0 = new DataView(wasm.memory.buffer); } return cachedDataViewMemory0; }",
    "function getArrayU8FromWasm0(ptr, len) { return getUint8ArrayMemory0().subarray(ptr >>> 0, (ptr >>> 0) + len); }",
    "function getStringFromWasm0(ptr, len) { return new TextDecoder().decode(getUint8ArrayMemory0().subarray(ptr >>> 0, (ptr >>> 0) + len)); }",
    "function passArray8ToWasm0(arg, malloc) { const ptr = malloc(arg.length * 1, 1) >>> 0; getUint8ArrayMemory0().set(arg, ptr); WASM_VECTOR_LEN = arg.length; return ptr; }",
    "function passStringToWasm0(arg, malloc, realloc) { const buf = new TextEncoder().encode(arg); const ptr = malloc(buf.length, 1) >>> 0; getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf); WASM_VECTOR_LEN = buf.length; return ptr; }",
    "function __wbg_get_imports() {",
    "  return {",
    "    './anydoc_wasm_bg.js': {",
    "      __wbg_String_8564e559799eccda: function(arg0, arg1) { const ret = String(getObject(arg1)); const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2); const len1 = WASM_VECTOR_LEN; getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true); getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true); },",
    "      __wbg___wbindgen_throw_344f42d3211c4765: function(arg0, arg1) { throw new Error(getStringFromWasm0(arg0, arg1)); },",
    "      __wbg_from_13e323c65fc8f464: function(arg0) { return addHeapObject(Array.from(getObject(arg0))); },",
    "      __wbg_getRandomValues_cc7f052a444bb2ce: function() { return handleError(function (arg0, arg1) { globalThis.crypto.getRandomValues(getArrayU8FromWasm0(arg0, arg1)); }, arguments); },",
    "      __wbg_new_32b398fb48b6d94a: function() { return addHeapObject(new Array()); },",
    "      __wbg_new_b667d279fd5aa943: function(arg0, arg1) { return addHeapObject(new Error(getStringFromWasm0(arg0, arg1))); },",
    "      __wbg_new_cd45aabdf6073e84: function(arg0) { return addHeapObject(new Uint8Array(getObject(arg0))); },",
    "      __wbg_new_da52cf8fe3429cb2: function() { return addHeapObject(new Object()); },",
    "      __wbg_push_d2ae3af0c1217ae6: function(arg0, arg1) { return getObject(arg0).push(getObject(arg1)); },",
    "      __wbg_set_6be42768c690e380: function(arg0, arg1, arg2) { getObject(arg0)[takeObject(arg1)] = takeObject(arg2); },",
    "      __wbg_set_8535240470bf2500: function() { return handleError(function (arg0, arg1, arg2) { return Reflect.set(getObject(arg0), getObject(arg1), getObject(arg2)); }, arguments); },",
    "      __wbg_set_8a16b38e4805b298: function(arg0, arg1, arg2) { getObject(arg0)[arg1 >>> 0] = takeObject(arg2); },",
    "      __wbindgen_cast_0000000000000001: function(arg0) { return addHeapObject(arg0); },",
    "      __wbindgen_cast_0000000000000002: function(arg0, arg1) { return addHeapObject(getArrayU8FromWasm0(arg0, arg1)); },",
    "      __wbindgen_cast_0000000000000003: function(arg0, arg1) { return addHeapObject(getStringFromWasm0(arg0, arg1)); },",
    "      __wbindgen_object_clone_ref: function(arg0) { return addHeapObject(getObject(arg0)); },",
    "      __wbindgen_object_drop_ref: function(arg0) { takeObject(arg0); }",
    "    }",
    "  };",
    "}",
    "function toMarkdownBytes(bytes, format) {",
    "  let deferred3_0; let deferred3_1;",
    "  try {",
    "    const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);",
    "    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_export);",
    "    const len0 = WASM_VECTOR_LEN;",
    "    wasm.toMarkdownBytes(retptr, ptr0, len0, isLikeNone(format) ? 13 : ((__wbindgen_enum_Format.indexOf(format) + 1 || 13) - 1));",
    "    var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);",
    "    var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);",
    "    var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);",
    "    var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);",
    "    var ptr2 = r0; var len2 = r1;",
    "    if (r3) { ptr2 = 0; len2 = 0; throw takeObject(r2); }",
    "    deferred3_0 = ptr2; deferred3_1 = len2;",
    "    return getStringFromWasm0(ptr2, len2);",
    "  } finally {",
    "    wasm.__wbindgen_add_to_stack_pointer(16);",
    "    if (deferred3_0) wasm.__wbindgen_export4(deferred3_0, deferred3_1, 1);",
    "  }",
    "}",
    "try {",
    "  var wasmBytes = b64ToUint8Array('" + wasmB64 + "');",
    "  var pdfBytes = b64ToUint8Array('" + pdfB64 + "');",
    "  var module = new WebAssembly.Module(wasmBytes.buffer);",
    "  var instance = new WebAssembly.Instance(module, __wbg_get_imports());",
    "  wasmInstance = instance; wasm = instance.exports;",
    "",
    "  print('MARKDOWN_OUTPUT_START');",
    "  var mdResult = toMarkdownBytes(pdfBytes, 'pdf');",
    "  print(mdResult);",
    "  print('MARKDOWN_OUTPUT_END');",
    "} catch (e) {",
    "  print('ERROR: ' + (e.stack || e.message || e));",
    "}"
  ].join("\n");

  // 1.5 安全保存临时胶水文件 (改用 NSString 兼容 API)
  const nsWorkerStr = $.NSString.stringWithString(workerScript);
  nsWorkerStr.writeToFileAtomicallyEncodingError(tmpScriptPath, true, 4, null);

  console.log("⚡️ 启动系统 JavaScriptCore 评估引擎...");
  const jscPath = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc";

  // 1.6 通过 JXA 标准的 NSTask / system 管道派生底层进程，完美避免 -2700 异常
  const command = "'" + jscPath + "' '" + tmpScriptPath + "'";
  const rawOutputObj = $.NSString.stringWithString("");
  
  // 使用 JXA 标准安全执行 pipe
  const pipe = $.NSPipe.pipe;
  const task = $.NSTask.alloc.init;
  
  task.setLaunchPath(jscPath);
  task.setArguments($.NSArray.arrayWithObject(tmpScriptPath));
  task.setStandardOutput(pipe);
  task.setStandardError(pipe);
  
  task.launch;
  
  const data = pipe.fileHandleForReading.readDataToEndOfFile;
  task.waitUntilExit;

  // 清理临时脚本
  fm.removeItemAtPathError(tmpScriptPath, null);

  // 1.7 解析 JSC 执行返回的结果
  const nsStrOutput = $.NSString.alloc.initWithDataEncoding(data, 4);
  const rawOutput = ObjC.unwrap(nsStrOutput) || "";

  if (rawOutput.indexOf("MARKDOWN_OUTPUT_START") !== -1) {
    const mdContent = rawOutput.split("MARKDOWN_OUTPUT_START")[1].split("MARKDOWN_OUTPUT_END")[0].trim();
    if (mdContent.length > 0) {
      const nsMdContent = $.NSString.stringWithString(mdContent);
      nsMdContent.writeToFileAtomicallyEncodingError(outputPath, true, 4, null);

      console.log("\n🎉 PDF 转换为 Markdown 成功！");
      console.log("💾 转换结果已保存至: " + outputPath);
      console.log("\n--- Markdown 预览 (前 300 字符) ---");
      console.log(mdContent.slice(0, 300) + (mdContent.length > 300 ? "\n..." : ""));
      console.log("-----------------------------------");
    } else {
      console.log("\n⚠️ 转换完成，但导出的 Markdown 内容为空。引擎输出:\n" + rawOutput);
    }
  } else {
    console.log("\n❌ 引擎运行或转码异常：\n" + rawOutput);
  }
}

// =============================================================================
// 2. Node.js 编译与启动程序
// =============================================================================
function startNodeProcess(): void {
  const cp = require('child_process');
  const path = require('path');
  const esbuild = require('esbuild');

  console.log("📦 正在提取并用 esbuild 转译 JXA 代码...");

  // 2.1 提取 runJxaLogic 函数源码，打包为符合 JXA 的单文件规范
  const jxaRawSource = `(${runJxaLogic.toString()})();`;

  // 2.2 使用 transformSync 进行 TS 到 ES2020 IIFE 的转译
  const buildResult = esbuild.transformSync(jxaRawSource, {
    loader: 'ts',
    target: 'es2020',
    format: 'iife',
  });

  const jxaCompiledCode = buildResult.code;

  console.log("🚀 启动 osascript -l JavaScript 执行 JXA...");

  const args = process.argv.slice(2);
  const scriptPath = path.resolve(process.argv[1]);
  const osaArgs = ['-l', 'JavaScript', '-e', jxaCompiledCode, '--', scriptPath].concat(args);

  try {
    cp.execFileSync('osascript', osaArgs, {
      stdio: 'inherit',
    });
  } catch (err: any) {
    console.error("❌ osascript 执行异常终止:", err.message || err);
    process.exit(err.status || 1);
  }
}

// 根据当前环境自动切入对应的入口 point
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  startNodeProcess();
} else {
  runJxaLogic();
}