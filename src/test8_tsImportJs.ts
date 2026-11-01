#!/usr/bin/env ts-node
// 这个文件是采用node使用child_process拉起jxa调用编译后的js（需要node环境）代码，只具备参考性
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import esbuild from 'esbuild';

// JXA 环境类型声明
declare const ObjC: any;
declare const $: any;

// =============================================================================
// 1. JXA 运行时逻辑 (执行于 osascript 进程中)
// =============================================================================
function runJxaLogic(): void {
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

  const runnerScriptPath = jsArgs[1];
  const pdfPath = jsArgs[2];
  const outputPath = pdfPath ? pdfPath.replace(/\.pdf$/i, '.md') : '';

  console.log('==================================================');
  console.log('=== JXA + JSC 动态模块注入转换 PDF -> Markdown ===');
  console.log('==================================================');
  console.log('📄 PDF 源文件: ' + pdfPath);

  // 1.2 校验文件存在性
  const fm = $.NSFileManager.defaultManager;
  if (!fm.fileExistsAtPath($.NSString.stringWithString(runnerScriptPath))) {
    throw new Error('❌ Runner 胶水脚本不存在: ' + runnerScriptPath);
  }

  // 1.3 启动 JavaScriptCore (jsc)
  const jscPath =
    '/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc';

  const pipe = $.NSPipe.pipe;
  const task = $.NSTask.alloc.init;

  // 使用 '--' 隔离脚本路径与命令行参数
  task.setLaunchPath(jscPath);
  task.setArguments([runnerScriptPath, '--', pdfPath]);
  task.setStandardOutput(pipe);
  task.setStandardError(pipe);

  console.log('⚡️ 启动 JavaScriptCore 执行 WASM 模块...');
  task.launch;

  const data = pipe.fileHandleForReading.readDataToEndOfFile;
  task.waitUntilExit;

  // 1.4 解析结果
  const nsStrOutput = $.NSString.alloc.initWithDataEncoding(data, 4);
  const rawOutput = ObjC.unwrap(nsStrOutput) || '';

  if (rawOutput.indexOf('MARKDOWN_OUTPUT_START') !== -1) {
    const mdContent = rawOutput
      .split('MARKDOWN_OUTPUT_START')[1]
      .split('MARKDOWN_OUTPUT_END')[0]
      .trim();

    if (mdContent.length > 0) {
      const nsMdContent = $.NSString.stringWithString(mdContent);
      nsMdContent.writeToFileAtomicallyEncodingError(
        outputPath,
        true,
        4,
        null
      );

      console.log('\n🎉 PDF 转换为 Markdown 成功！');
      console.log('💾 转换结果已保存至: ' + outputPath);
      console.log('\n--- Markdown 预览 (前 300 字符) ---');
      console.log(
        mdContent.slice(0, 300) + (mdContent.length > 300 ? '\n...' : '')
      );
      console.log('-----------------------------------');
    } else {
      console.log(
        '\n⚠️ 转换完成，但导出的 Markdown 内容为空。JSC 输出:\n' + rawOutput
      );
    }
  } else {
    console.log('\n❌ JSC 引擎执行过程中发生异常：\n' + rawOutput);
  }

  // 清理临时 Runner 文件
  if (fm.fileExistsAtPath($.NSString.stringWithString(runnerScriptPath))) {
    fm.removeItemAtPathError(runnerScriptPath, null);
  }
}

// =============================================================================
// 2. Node.js 主进程：编译 JS 胶水代码并组装 JSC Runner 脚本
// =============================================================================
function startNodeProcess(): void {
  const args = process.argv.slice(2);
  const targetPdf = args[0] || '/Users/xu/Desktop/chunk_1.pdf';

  if (!fs.existsSync(targetPdf)) {
    console.error('❌ PDF 文件不存在: ' + targetPdf);
    process.exit(1);
  }

  console.log('🔍 正在解析 WASM 模块及同级 JS 胶水文件...');

  let wasmPkgPath: string;
  try {
    wasmPkgPath = require.resolve('@firecrawl/anydoc-wasm');
  } catch (e) {
    wasmPkgPath = path.resolve(
      process.cwd(),
      'node_modules/@firecrawl/anydoc-wasm/anydoc_wasm.js'
    );
  }

  const pkgDir = path.dirname(wasmPkgPath);
  const wasmFilePath = path.join(pkgDir, 'anydoc_wasm_bg.wasm');

  let glueJsPath = path.join(pkgDir, 'anydoc_wasm.js');
  if (!fs.existsSync(glueJsPath)) {
    glueJsPath = path.join(pkgDir, 'anydoc_wasm_bg.js');
  }

  if (!fs.existsSync(wasmFilePath)) {
    console.error('❌ 找不到 WASM 文件: ' + wasmFilePath);
    process.exit(1);
  }
  if (!fs.existsSync(glueJsPath)) {
    console.error('❌ 找不到 WASM JS 胶水文件: ' + glueJsPath);
    process.exit(1);
  }

  console.log('⚙️ 读取 WASM 字节与编译 ESM 胶水代码...');
  const wasmBuffer = fs.readFileSync(wasmFilePath);
  const wasmB64 = wasmBuffer.toString('base64');

  // 💡 改进 1：直接在 Node 侧读取 PDF 转为 Base64，避免在 JSC 内依赖 Cocoa/JXA 运行时
  const pdfBuffer = fs.readFileSync(targetPdf);
  const pdfB64 = pdfBuffer.toString('base64');

  const rawGlueCode = fs.readFileSync(glueJsPath, 'utf-8');

  // 转译 WASM 胶水代码为 IIFE，导出至全域变量 WasmGlue
  const transformResult = esbuild.transformSync(rawGlueCode, {
    loader: 'js',
    target: 'es2020',
    format: 'iife',
    globalName: 'WasmGlue',
  });
  const compiledGlueCode = transformResult.code;

  // 2.2 构建注入给 JSC 的 Runner 执行脚本
  const runnerContent = [
    "// === 1. Polyfills & Complete Web/Browser Environment Mocks for JSC ===",
    "if (typeof globalThis === 'undefined') { var globalThis = this; }",
    "if (typeof window === 'undefined') { globalThis.window = globalThis; }",
    "if (typeof self === 'undefined') { globalThis.self = globalThis; }",
    "if (typeof navigator === 'undefined') { globalThis.navigator = { userAgent: 'JSC' }; }",
    "if (typeof document === 'undefined') { globalThis.document = { createElement: function() { return {}; } }; }",
    "if (typeof location === 'undefined') { globalThis.location = { href: 'http://localhost/' }; }",
    "if (typeof performance === 'undefined') { globalThis.performance = { now: function() { return Date.now(); } }; }",
    "",
    "if (typeof TextDecoder === 'undefined') {",
    "  function TextDecoder(encoding) { this.encoding = encoding || 'utf-8'; }",
    "  TextDecoder.prototype.decode = function(bytes) {",
    "    if (!bytes || !bytes.length) return '';",
    "    var str = '';",
    "    for (var i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);",
    "    try { return decodeURIComponent(escape(str)); } catch(e) { return str; }",
    "  };",
    "  globalThis.TextDecoder = TextDecoder;",
    "}",
    "if (typeof TextEncoder === 'undefined') {",
    "  function TextEncoder() {}",
    "  TextEncoder.prototype.encode = function(str) {",
    "    var utf8 = unescape(encodeURIComponent(str || ''));",
    "    var result = new Uint8Array(utf8.length);",
    "    for (var i = 0; i < utf8.length; i++) result[i] = utf8.charCodeAt(i);",
    "    return result;",
    "  };",
    "  globalThis.TextEncoder = TextEncoder;",
    "}",
    "if (typeof crypto === 'undefined') {",
    "  globalThis.crypto = {",
    "    getRandomValues: function(arr) {",
    "      for (var i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);",
    "      return arr;",
    "    }",
    "  };",
    "}",
    "if (typeof atob === 'undefined') {",
    "  var b64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';",
    "  globalThis.atob = function(input) {",
    "    var str = String(input).replace(/=+$/, '');",
    "    var output = '';",
    "    if (str.length % 4 === 1) throw new Error('Invalid base64 string');",
    "    for (var bc = 0, bs, buffer, idx = 0; buffer = str.charAt(idx++);",
    "      ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++) ?",
    "        output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0",
    "    ) { buffer = b64Chars.indexOf(buffer); }",
    "    return output;",
    "  };",
    "}",
    "function b64ToUint8Array(b64) {",
    "  var binStr = atob(b64);",
    "  var bytes = new Uint8Array(binStr.length);",
    "  for (var i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);",
    "  return bytes;",
    "}",
    "",
    "// === 2. Compiled Glue Code (IIFE) ===",
    compiledGlueCode,
    "",
    "// === 3. WASM 模块初始化与执行驱动 ===",
    "(function() {",
    "  try {",
    "    var wasmB64 = '" + wasmB64 + "';",
    "    var pdfB64 = '" + pdfB64 + "';",
    "",
    "    var wasmBytes = b64ToUint8Array(wasmB64);",
    "    var pdfBytes = b64ToUint8Array(pdfB64);",
    "    var wasmModule = new WebAssembly.Module(wasmBytes.buffer);",
    "",
    "    var glue = typeof WasmGlue !== 'undefined' ? WasmGlue : {};",
    "",
    "    // 💡 关键修复：兼容多版本 wasm-bindgen 导出形式，确保 initSync 安全调用",
    "    if (typeof glue.initSync === 'function') {",
    "      glue.initSync({ module: wasmModule });",
    "    } else if (typeof glue.default === 'function' && typeof glue.default.initSync === 'function') {",
    "      glue.default.initSync({ module: wasmModule });",
    "    } else {",
    "      var importsObj = {};",
    "      if (typeof glue.__wbg_get_imports === 'function') {",
    "        importsObj = glue.__wbg_get_imports();",
    "      }",
    "      var instance = new WebAssembly.Instance(wasmModule, importsObj);",
    "      if (typeof glue.__wbg_set_wasm === 'function') {",
    "        glue.__wbg_set_wasm(instance.exports);",
    "      }",
    "    }",
    "",
    "    // 查找 Markdown 转换导出方法",
    "    var convertFn =",
    "      glue.toMarkdownBytes ||",
    "      glue.to_markdown_bytes ||",
    "      glue.toMarkdown ||",
    "      glue.to_markdown ||",
    "      (glue.default && (glue.default.toMarkdownBytes || glue.default.to_markdown_bytes));",
    "",
    "    if (typeof convertFn !== 'function') {",
    "      throw new Error('在 WASM 胶水层中未找到有效的 Markdown 转换导出方法');",
    "    }",
    "",
    "    var rawResult = convertFn(pdfBytes, 'pdf');",
    "    var mdResult = '';",
    "",
    "    if (typeof rawResult === 'string') {",
    "      mdResult = rawResult;",
    "    } else if (rawResult instanceof Uint8Array || Array.isArray(rawResult)) {",
    "      var decoder = new TextDecoder('utf-8');",
    "      mdResult = decoder.decode(new Uint8Array(rawResult));",
    "    } else {",
    "      mdResult = String(rawResult || '');",
    "    }",
    "",
    "    print('MARKDOWN_OUTPUT_START');",
    "    print(mdResult);",
    "    print('MARKDOWN_OUTPUT_END');",
    "  } catch (e) {",
    "    print('ERROR: ' + (e.stack || e.message || e));",
    "  }",
    "})();",
  ].join('\n');

  // 2.3 保存 Runner 临时文件
  const tmpRunnerPath = path.join(
    '/tmp',
    `anydoc_runner_${Date.now()}_${Math.random().toString(36).slice(2)}.js`
  );
  fs.writeFileSync(tmpRunnerPath, runnerContent, 'utf-8');

  console.log('📦 正在打包 JXA 主控制代码...');
  const jxaRawSource = `(${runJxaLogic.toString()})();`;
  const buildResult = esbuild.transformSync(jxaRawSource, {
    loader: 'ts',
    target: 'es2020',
    format: 'iife',
  });

  console.log('🚀 启动 osascript (JXA)...');
  const scriptPath = path.resolve(process.argv[1]);
  const osaArgs = [
    '-l',
    'JavaScript',
    '-e',
    buildResult.code,
    '--',
    scriptPath,
    tmpRunnerPath,
    targetPdf,
  ];

  try {
    cp.execFileSync('osascript', osaArgs, { stdio: 'inherit' });
  } catch (err: any) {
    if (fs.existsSync(tmpRunnerPath)) {
      fs.unlinkSync(tmpRunnerPath);
    }
    console.error('❌ 执行失败:', err.message || err);
    process.exit(err.status || 1);
  }
}

// 入口判别
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  startNodeProcess();
} else {
  runJxaLogic();
}