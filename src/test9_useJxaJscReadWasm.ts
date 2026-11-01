declare const ObjC: any;
declare const $: any;
declare const Ref: any;
declare const process: any;

// ============================================================================
// 1. 环境初始化与 JXA 运行时检测
// ============================================================================
function initJxaEnvironment(): boolean {
  if (typeof ObjC !== 'undefined' && typeof $ !== 'undefined') {
    try {
      ObjC.import('stdlib');
      ObjC.import('Foundation');
      return true;
    } catch (e) {}
  }
  return false;
}

// ============================================================================
// 2. 原生 JXA/Cocoa 文件操作与日志工具
// ============================================================================
const NativeIO = {
  expandTildePath(p: string): string {
    return $(p).stringByExpandingTildeInPath.stringByStandardizingPath.js;
  },

  readFileSyncToCleanUint8Array(filePath: string): Uint8Array {
    const expandedPath = this.expandTildePath(filePath);
    const nsData = $.NSData.dataWithContentsOfFile($(expandedPath));
    if (!nsData || nsData.isNil() || nsData.length === 0) {
      throw new Error(`[JXA File Error] 无法读取文件或文件为空: ${expandedPath}`);
    }
    const length = nsData.length;
    const uint8Array = new Uint8Array(length);
    nsData.getBytesLength(uint8Array, length);
    return uint8Array;
  },

  writeTextFileSync(filePath: string, text: string): void {
    const expandedPath = this.expandTildePath(filePath);
    const nsString = $.NSString.stringWithString(text);
    const errorRef = Ref();
    const success = nsString.writeToFileAtomicallyEncodingError(
      $(expandedPath),
      true,
      $.NSUTF8StringEncoding,
      errorRef
    );
    if (!success) {
      const err = errorRef[0];
      const errDesc = err ? err.localizedDescription.js : 'Unknown error';
      throw new Error(`[JXA File Write Error] 写入文件失败 (${expandedPath}): ${errDesc}`);
    }
  },

  writeStdout(msg: string): void {
    const data = $(`${msg}\n`).dataUsingEncoding($.NSUTF8StringEncoding);
    $.NSFileHandle.fileHandleWithStandardOutput.writeData(data);
  },

  writeStderr(msg: string): void {
    const data = $(`${msg}\n`).dataUsingEncoding($.NSUTF8StringEncoding);
    $.NSFileHandle.fileHandleWithStandardError.writeData(data);
  }
};

function getSameDirMarkdownPath(pdfPath: string): string {
  const lastDotIndex = pdfPath.lastIndexOf('.');
  return lastDotIndex === -1 ? `${pdfPath}.md` : `${pdfPath.substring(0, lastDotIndex)}.md`;
}

// ============================================================================
// 3. 核心 bridge：JXA 调度 system JavaScriptCore (jsc) 引擎执行 WASM
// ============================================================================
function execJscWasmBridge(wasmBytes: Uint8Array, pdfBytes: Uint8Array): string {
  const fm = $.NSFileManager.defaultManager;

  // 1. 寻找 jsc 引擎路径
  const candidatePaths = [
    '/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc'
  ];
  let jscPath = '';
  for (let i = 0; i < candidatePaths.length; i++) {
    if (fm.fileExistsAtPath($(candidatePaths[i]))) {
      jscPath = candidatePaths[i];
      break;
    }
  }

  if (!jscPath) {
    throw new Error('未能在 macOS 系统中找到可调用的 jsc 引擎');
  }

  // 2. 将 Uint8Array 转为 Base64 传递给 jsc 宿主
  const wasmNSData = $.NSData.dataWithBytesLength(wasmBytes, wasmBytes.length);
  const pdfNSData = $.NSData.dataWithBytesLength(pdfBytes, pdfBytes.length);

  const wasmB64 = wasmNSData.base64EncodedStringWithOptions(0).js;
  const pdfB64 = pdfNSData.base64EncodedStringWithOptions(0).js;

  // 3. 构造临时 JSC Worker 脚本
  const tmpWorkerPath = `/tmp/jsc_wasm_worker_${Date.now()}.js`;
  const workerScript = `
    if (typeof TextDecoder === 'undefined') {
      function TextDecoder() {}
      TextDecoder.prototype.decode = function(b) {
        if (!b) return '';
        var s = ''; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
        try { return decodeURIComponent(escape(s)); } catch(e) { return s; }
      };
    }

    function b64ToUint8Array(b64) {
      var binStr = atob(b64);
      var bytes = new Uint8Array(binStr.length);
      for (var i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
      return bytes;
    }

    // wasm-bindgen 模块导入表存根补齐
    function createWasmImports() {
      var noopProxy = new Proxy({}, {
        get: function(target, prop) {
          if (prop === '__wbindgen_throw') return function(p, l) { throw new Error('WASM Throw'); };
          return function() { return 0; };
        }
      });
      return new Proxy({}, { get: function() { return noopProxy; } });
    }

    try {
      var wasmBytes = b64ToUint8Array("${wasmB64}");
      var pdfBytes = b64ToUint8Array("${pdfB64}");

      var wasmModule = new WebAssembly.Module(wasmBytes.buffer);
      var imports = createWasmImports();
      var wasmInstance = new WebAssembly.Instance(wasmModule, imports);
      var exports = wasmInstance.exports;

      var fn = exports.toMarkdownBytes || exports.to_markdown_bytes || exports.to_markdown || exports.convert;

      print("MARKDOWN_OUTPUT_START");
      if (typeof fn === 'function') {
        var malloc = exports.__wbindgen_malloc || exports.malloc || exports.alloc;
        if (malloc) {
          var ptr = malloc(pdfBytes.length);
          var mem = new Uint8Array(exports.memory.buffer);
          mem.set(pdfBytes, ptr);
          var res = fn(ptr, pdfBytes.length);
          print(typeof res === 'string' ? res : new TextDecoder().decode(res));
        } else {
          var res = fn(pdfBytes);
          print(typeof res === 'string' ? res : new TextDecoder().decode(res));
        }
      }
      print("MARKDOWN_OUTPUT_END");
    } catch(e) {
      print("ERROR: " + e.message + "\\n" + e.stack);
    }
  `;

  // 写入 Worker 临时文件
  const scriptNSStr = $.NSString.stringWithString(workerScript);
  scriptNSStr.writeToFileAtomicallyEncodingError($(tmpWorkerPath), true,$.NSUTF8StringEncoding, Ref());

  // 4. 通过 NSTask 调用系统 jsc
  const task = $.NSTask.alloc.init;
  const pipeOut = $.NSPipe.pipe;

  task.executableURL = $.NSURL.fileURLWithPath($(jscPath));
  task.arguments = $([tmpWorkerPath]);
  task.standardOutput = pipeOut;
  task.standardError = pipeOut;

  task.launchAndReturnError(Ref());
  task.waitUntilExit;

  // 清理临时文件
  fm.removeItemAtPathError($(tmpWorkerPath), Ref());

  // 5. 提取并返回 JSC 转换出的 Markdown
  const outData = pipeOut.fileHandleForReading.readDataToEndOfFile;
  const rawOutput = $.NSString.alloc.initWithDataEncoding(outData, $.NSUTF8StringEncoding).js.trim();

  if (rawOutput.indexOf('MARKDOWN_OUTPUT_START') !== -1) {
    return rawOutput.split('MARKDOWN_OUTPUT_START')[1].split('MARKDOWN_OUTPUT_END')[0].trim();
  } else {
    throw new Error(`JSC WASM 执行失败:\n${rawOutput}`);
  }
}

// ============================================================================
// 4. JXA 核心主逻辑
// ============================================================================
function runJxaPipeline() {
  const WASM_PATH = '/Users/xu/Developer/smallTools/exportMarkdown_ts/node_modules/@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm';
  const PDF_PATH = '/Users/xu/Desktop/chunk_1.pdf';
  const OUTPUT_MD_PATH = getSameDirMarkdownPath(PDF_PATH);

  NativeIO.writeStdout('🚀 开始初始化 JXA + JSC 跨宿主 WASM 解析架构...');

  try {
    NativeIO.writeStdout(`📦 读取 WASM 文件: ${WASM_PATH}`);
    const wasmBytes = NativeIO.readFileSyncToCleanUint8Array(WASM_PATH);
    NativeIO.writeStdout(`  └─ WASM 文件大小: ${wasmBytes.length} 字节`);

    NativeIO.writeStdout(`📄 读取 PDF 文件: ${PDF_PATH}`);
    const pdfBytes = NativeIO.readFileSyncToCleanUint8Array(PDF_PATH);
    NativeIO.writeStdout(`  └─ PDF 文件大小: ${pdfBytes.length} 字节`);

    // PDF 头部预检
    const isPdfHeader = pdfBytes.length >= 4 && pdfBytes[0] === 0x25 && pdfBytes[1] === 0x50 && pdfBytes[2] === 0x44 && pdfBytes[3] === 0x46;
    NativeIO.writeStdout(`  └─ PDF 头部标识预检: ${isPdfHeader ? '通过 (%PDF)' : '⚠️ 异常文件格式'}`);

    NativeIO.writeStdout('⚙️ 正在调度系统 JavaScriptCore (jsc) 引擎代理执行 WASM 转换...');
    const markdownText = execJscWasmBridge(wasmBytes, pdfBytes);

    if (!markdownText || !markdownText.trim()) {
      NativeIO.writeStdout('⚠️ 解码后的 Markdown 文本为空。请检查 PDF 是否包含文字/内容。');
    } else {
      NativeIO.writeStdout(`💾 正在保存 Markdown 文件至同目录: ${OUTPUT_MD_PATH}`);
      NativeIO.writeTextFileSync(OUTPUT_MD_PATH, markdownText);
      NativeIO.writeStdout(`✨ 文件保存完成: ${OUTPUT_MD_PATH}`);
      NativeIO.writeStdout('--------------------------------------------------');
      NativeIO.writeStdout('🎉 输出内容预览 (前 500 字):');
      NativeIO.writeStdout(markdownText.slice(0, 500) + (markdownText.length > 500 ? '\n... (略)' : ''));
      NativeIO.writeStdout('--------------------------------------------------');
    }
  } catch (error: any) {
    NativeIO.writeStderr(`❌ 运行过程报错: ${error?.stack || error?.message || error}`);
  }
}

// ============================================================================
// 5. 自动切换运行环境 (JXA 原生模式 vs npx tsx 开发转译模式)
// ============================================================================
if (initJxaEnvironment()) {
  // --------------------------------------------------------------------------
  // 分支 A: JXA 原生 (osascript) 引擎上下文
  // --------------------------------------------------------------------------
  runJxaPipeline();
} else if (typeof process !== 'undefined' && process.argv) {
  // --------------------------------------------------------------------------
  // 分支 B: Node 开发测试模式 (npx tsx src/jxa_wasm_test.ts)
  // 利用 esbuild 在内存中打成原生 JXA JavaScript 脚本，再启动 osascript 执行
  // --------------------------------------------------------------------------
  const mainModule = process.mainModule || (process as any).module;
  if (mainModule && typeof mainModule.require === 'function') {
    const cp = mainModule.require('child_process');
    const p = mainModule.require('path');
    const esbuild = mainModule.require('esbuild');

    const scriptPath = p.resolve(process.argv[1]);

    try {
      // 内存转译打包为单文件 IIFE 模式
      const buildResult = esbuild.buildSync({
        entryPoints: [scriptPath],
        bundle: true,
        write: false,
        format: 'iife',
        target: 'es2020',
        platform: 'neutral',
      });

      const compiledJs = buildResult.outputFiles[0].text;

      // 使用 osascript -l JavaScript 执行转译后的 JS
      const osaArgs = ['-l', 'JavaScript', '-e', compiledJs, '--', scriptPath];
      
      cp.execFileSync('osascript', osaArgs, {
        stdio: 'inherit',
      });
    } catch (err: any) {
      process.exit(err.status || 1);
    }
  }
}