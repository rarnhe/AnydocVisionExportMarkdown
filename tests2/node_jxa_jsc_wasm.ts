// =============================================================================
// 1. JXA 环境与 Cocoa Foundation 类型声明
// =============================================================================
declare const ObjC: {
  import: (framework: string) => void;
  unwrap: (obj: any) => any;
};

declare const $: {
  NSProcessInfo: any;
  NSFileManager: any;
  NSString: any;
  NSData: any;
  NSPipe: any;
  NSTask: any;
  NSURL: any;
  NSTemporaryDirectory: any;
  NSMutableArray: any;
  NSDictionary: any;
};

// 确保在 JXA 运行时下注入 Foundation 框架
if (typeof ObjC !== 'undefined' && typeof ObjC.import === 'function') {
  ObjC.import('Foundation');
}

// =============================================================================
// 2. Native Cocoa / Foundation 工具函数 (JXA 侧使用)
// =============================================================================
function toNsString(str: string): any {
  if (str === null || str === undefined) return $.NSString.string;
  return $.NSString.stringWithString(String(str));
}

function toJsString(obj: any): string {
  if (!obj) return '';
  const unwrapped = ObjC.unwrap(obj);
  return unwrapped ? String(unwrapped) : '';
}

function nativeFileExists(pathStr: string): boolean {
  if (!pathStr) return false;
  const fm = $.NSFileManager.defaultManager;
  return fm.fileExistsAtPath(toNsString(pathStr));
}

function nativeReadBinaryAsBase64(pathStr: string): string {
  const nsPath = toNsString(pathStr);
  const data = $.NSData.dataWithContentsOfFile(nsPath);
  if (!data || data.length === 0) {
    throw new Error(`无法读取文件或文件为空: ${pathStr}`);
  }
  return ObjC.unwrap(data.base64EncodedStringWithOptions(0));
}

function nativeWriteTextFile(pathStr: string, content: string): void {
  const nsStr = toNsString(content);
  const nsPath = toNsString(pathStr);
  const success = nsStr.writeToFileAtomicallyEncodingError(
    nsPath,
    true,
    4 /* NSUTF8StringEncoding */,
    null
  );
  if (!success) {
    throw new Error(`写入文件失败: ${pathStr}`);
  }
}

function nativeRemoveFile(pathStr: string): void {
  const fm = $.NSFileManager.defaultManager;
  const nsPath = toNsString(pathStr);
  if (fm.fileExistsAtPath(nsPath)) {
    fm.removeItemAtPathError(nsPath, null);
  }
}

function nativeJoinPath(dir: string, file: string): string {
  const nsDir = toNsString(dir);
  return toJsString(nsDir.stringByAppendingPathComponent(toNsString(file)));
}

function nativeGetTmpDir(): string {
  return toJsString($.NSTemporaryDirectory());
}

/**
 * 原生获取环境变量 (替代 process.env)
 */
function nativeGetEnv(key: string): string {
  if (typeof ObjC === 'undefined') return '';
  const envDict = $.NSProcessInfo.processInfo.environment;
  const nsVal = envDict.objectForKey(toNsString(key));
  return toJsString(nsVal);
}

/**
 * JXA 原生解析命令行参数 (替代 process.argv)
 */
function nativeParseArgs(): string[] {
  if (typeof ObjC === 'undefined') return [];
  const processInfo = $.NSProcessInfo.processInfo;
  const rawArgs = ObjC.unwrap(processInfo.arguments);
  const userArgs: string[] = [];
  let separatorFound = false;
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = toJsString(rawArgs[i]);
    if (separatorFound) {
      if (arg) userArgs.push(arg);
    } else if (arg === '--') {
      separatorFound = true;
    }
  }
  if (!separatorFound && rawArgs.length > 0) {
    for (let i = rawArgs.length - 1; i >= 0; i--) {
      const arg = toJsString(rawArgs[i]);
      if (arg && !arg.startsWith('-') && arg !== 'JavaScript') {
        userArgs.push(arg);
        break;
      }
    }
  }
  return userArgs;
}

// =============================================================================
// 3. 底层 JSC 运行时的原生 WASM 驱动脚本构建器
// =============================================================================
function buildJscKernelScript(wasmB64: string, glueCodeStr: string, pdfB64: string): string {
  return [
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
    "  globalThis.crypto = { getRandomValues: function(arr) { for (var i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); return arr; } };",
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
    "// 注入 IIFE 格式的胶水层",
    glueCodeStr,
    "",
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

// =============================================================================
// 4. JXA 核心执行模式 (被 osascript 调起执行)
// =============================================================================
function runJxaMode(): void {
  const args = nativeParseArgs();
  const pdfPath = args[0];

  if (!pdfPath) {
    console.log('❌ 请指定输入的 PDF 文件路径。');
    return;
  }

  if (!nativeFileExists(pdfPath)) {
    console.log('❌ 输入的 PDF 文件不存在: ' + pdfPath);
    return;
  }

  const outputPath = pdfPath.toLowerCase().endsWith('.pdf')
    ? pdfPath.slice(0, -4) + '.md'
    : pdfPath + '.md';

  const wasmB64 = (globalThis as any).__STATIC_WASM_B64__ || '';
  const glueCodeStr = (globalThis as any).__STATIC_GLUE_CODE__ || '';
  const needsWasm = Boolean(wasmB64 && glueCodeStr);

  if (!needsWasm) {
    console.log('🤖 [Direct JXA Mode] 无需 WASM 计算，直接在 JXA 宿主环境内处理...');
    const resultText = `# Direct JXA Export\nSource File: ${pdfPath}\nExecuted without WASM / $.NSTask`;
    nativeWriteTextFile(outputPath, resultText);
    console.log('🎉 处理完成！结果已导出至: ' + outputPath);
    return;
  }

  console.log('⚡️ [JSC Offload Mode] 检测到 WASM 密集计算，正在通过 Cocoa $.NSTask 派生 Native JSC...');

  const pdfB64 = nativeReadBinaryAsBase64(pdfPath);
  const innerKernelScript = buildJscKernelScript(wasmB64, glueCodeStr, pdfB64);

  const tmpDir = nativeGetTmpDir();
  const innerRunnerPath = nativeJoinPath(
    tmpDir,
    `jsc_inner_kernel_${Date.now()}_${Math.random().toString(36).slice(2)}.js`
  );
  nativeWriteTextFile(innerRunnerPath, innerKernelScript);

  const jscExecutable = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc';
  const pipe = $.NSPipe.pipe;
  const task = $.NSTask.alloc.init;

  task.setLaunchPath(toNsString(jscExecutable));
  const argsArray = $.NSMutableArray.alloc.init;
  argsArray.addObject(toNsString(innerRunnerPath));
  task.setArguments(argsArray);
  task.setStandardOutput(pipe);
  task.setStandardError(pipe);

  task.launch;
  const data = pipe.fileHandleForReading.readDataToEndOfFile;
  task.waitUntilExit;

  nativeRemoveFile(innerRunnerPath);

  const nsStrOutput = $.NSString.alloc.initWithDataEncoding(data, 4 /* NSUTF8StringEncoding */);
  const rawOutput = toJsString(nsStrOutput);

  if (rawOutput.indexOf('MARKDOWN_OUTPUT_START') !== -1) {
    const mdContent = rawOutput
      .split('MARKDOWN_OUTPUT_START')[1]
      .split('MARKDOWN_OUTPUT_END')[0]
      .trim();

    if (mdContent.length > 0) {
      nativeWriteTextFile(outputPath, mdContent);
      console.log('\n🎉 [WASM Offload] PDF 转换为 Markdown 成功！');
      console.log('💾 转换结果已保存至: ' + outputPath);
    } else {
      console.log('\n⚠️ 转换完成，但导出的 Markdown 内容为空。JSC 输出:\n' + rawOutput);
    }
  } else {
    console.log('\n❌ Native JSC 引擎执行异常：\n' + rawOutput);
  }
}

// =============================================================================
// 5. Node.js 开发调试入口 (动态加载 WASM 与胶水层，编译为临时 Bundle 供 osascript 运行)
// =============================================================================
function runNodeMode(): void {
  const req = typeof eval !== 'undefined' ? eval('require') : null;
  if (!req) return;

  const fs = req('fs');
  const path = req('path');
  const esbuild = req('esbuild');
  const cp = req('child_process');
  const nodeProcess = typeof process !== 'undefined' ? process : null;
  if (!nodeProcess) return;

  const args = nodeProcess.argv.slice(2);
  const targetPdf = args[0]
    ? path.resolve(args[0])
    : path.resolve(__dirname, '../chunk_1.pdf');

  if (!fs.existsSync(targetPdf)) {
    console.error('❌ PDF 文件不存在: ' + targetPdf);
    nodeProcess.exit(1);
  }

  console.log('🔍 [Node 开发调试] 动态准备 WASM 模块与胶水层...');

  let wasmPkgPath: string;
  try {
    wasmPkgPath = req.resolve('@firecrawl/anydoc-wasm');
  } catch (e) {
    wasmPkgPath = path.resolve(
      nodeProcess.cwd(),
      'node_modules/@firecrawl/anydoc-wasm/anydoc_wasm.js'
    );
  }

  const pkgDir = path.dirname(wasmPkgPath);
  const wasmFilePath = path.join(pkgDir, 'anydoc_wasm_bg.wasm');
  let glueJsPath = path.join(pkgDir, 'anydoc_wasm.js');
  if (!fs.existsSync(glueJsPath)) {
    glueJsPath = path.join(pkgDir, 'anydoc_wasm_bg.js');
  }

  const wasmB64 = fs.readFileSync(wasmFilePath).toString('base64');
  const rawGlueCode = fs.readFileSync(glueJsPath, 'utf-8');

  // 使用 esbuild 将胶水层打包为 IIFE 格式，并定义全局 WasmGlue
  const transformResult = esbuild.transformSync(rawGlueCode, {
    loader: 'js',
    target: 'es2020',
    format: 'iife',
    globalName: 'WasmGlue',
  });

  // 读取当前 TS 编译后的自身源码或通过 esbuild 把当前文件打包
  const currentFilePath = __filename;
  const buildResult = esbuild.buildSync({
    entryPoints: [currentFilePath],
    bundle: true,
    write: false,
    platform: 'neutral',
    format: 'iife',
    define: {
      'process.env.BUILD_TARGET': '"jxa"',
      'globalThis.__STATIC_WASM_B64__': JSON.stringify(wasmB64),
      '__STATIC_WASM_B64__': JSON.stringify(wasmB64),
      'globalThis.__STATIC_GLUE_CODE__': JSON.stringify(transformResult.code),
      '__STATIC_GLUE_CODE__': JSON.stringify(transformResult.code),
    },
  });

  const bundledCode = buildResult.outputFiles[0].text;

  const tmpRunnerPath = path.join(
    '/tmp',
    `anydoc_runner_${Date.now()}_${Math.random().toString(36).slice(2)}.js`
  );
  fs.writeFileSync(tmpRunnerPath, bundledCode, 'utf-8');

  console.log('⚡️ [Node 开发调试] 调起 osascript 执行静态打包后的临时 Bundle...');
  const osaArgs = ['-l', 'JavaScript', tmpRunnerPath, '--', targetPdf];

  try {
    cp.execFileSync('osascript', osaArgs, { stdio: 'inherit' });
  } catch (e: any) {
    console.error('❌ osascript 执行发生异常:', e.message);
  } finally {
    if (fs.existsSync(tmpRunnerPath)) {
      fs.unlinkSync(tmpRunnerPath);
    }
  }
}

// =============================================================================
// 6. 环境判断与分发入口
// =============================================================================
const buildTarget = nativeGetEnv('BUILD_TARGET');
const isJxa = typeof ObjC !== 'undefined';
const isNode = typeof process !== 'undefined' && Boolean(process.versions && process.versions.node);

if (buildTarget === 'jxa' || isJxa) {
  runJxaMode();
} else if (isNode) {
  runNodeMode();
}