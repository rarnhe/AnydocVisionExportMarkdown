#!/usr/bin/env osascript -l JavaScript

// test2.js (JXA 运行环境诊断与 WASM 加载测试)
// 运行方法: osascript -l JavaScript src/test2.js ./anydoc_wasm_bg.wasm

ObjC.import('Foundation');

function run(argv) {
  if (!argv || argv.length < 1) {
    console.log("用法: osascript -l JavaScript src/test2.js <path-to-wasm>");
    return;
  }

  var wasmPath = argv[0];
  console.log("=== POC 2 (环境诊断与 WASM 评估): WASM 读取与实例化测试 ===");

  // 1. Cocoa 原生极速读取 WASM 二进制文件
  var wasmNSData = $.NSData.dataWithContentsOfFile(wasmPath);
  if (wasmNSData.isNil()) {
    throw new Error("无法读取 WASM 文件: " + wasmPath);
  }

  var length = wasmNSData.length;
  console.log("WASM 文件读取成功，大小: " + length + " 字节");

  // 2. 内存安全充填 Uint8Array 缓冲区
  var t0 = Date.now();
  var b64Str = wasmNSData.base64EncodedStringWithOptions(0).js;
  
  var binStr = $($.NSString.alloc.initWithDataEncoding(
    $.NSData.alloc.initWithBase64EncodedStringOptions(b64Str, 0),
    $.NSASCIIStringEncoding
  )).js;

  var wasmBuffer = new ArrayBuffer(length);
  var view = new Uint8Array(wasmBuffer);
  for (var i = 0; i < length; i++) {
    view[i] = binStr.charCodeAt(i);
  }
  var t1 = Date.now();

  console.log("✅ 快速且完全无崩溃加载二进制 Memory，耗时: " + (t1 - t0) + " ms");

  // 3. 检查当前 JXA 环境是否具备 WebAssembly 支持
  if (typeof WebAssembly !== "undefined") {
    console.log("✅ 检测到环境原生支持 WebAssembly JS API，准备实例化...");
    
    try {
      var wasmModule = new WebAssembly.Module(wasmBuffer);
      var wasmInstance = new WebAssembly.Instance(wasmModule, {});
      console.log("🎉 WebAssembly 模块实例化成功！");
    } catch (err) {
      console.log("❌ WebAssembly 实例化失败: " + err.message);
    }

  } else {
    console.log("⚠️ 诊断信息: 当前 osascript (JXA JSC) 运行时未暴露全局 'WebAssembly' 对象。");
    console.log("💡 说明: macOS 的 osascript 裸 JavaScriptCore 环境移除了 WebAssembly 宿主接口。");
    
    // 4. 自动化备选方案：通过 JXA 原生 NSTask 管道调度 WASM 引擎 (Node / Bun / JavaScriptCore CLI)
    console.log("\n正在尝试通过 Cocoa NSTask 管道验证系统的 JS 引擎 WASM 执行能力...");
    
    var task = $.NSTask.alloc.init;
    var pipe = $.NSPipe.pipe;
    
    task.executableURL = $.NSURL.fileURLWithPath('/usr/bin/env');
    task.arguments = ['node', '-e', 'console.log("Node.js WebAssembly 支持状态:", typeof WebAssembly !== "undefined")'];
    task.standardOutput = pipe;
    
    var error = $();
    if (task.launchAndReturnError(error)) {
      task.waitUntilExit;
      var data = pipe.fileHandleForReading.readDataToEndOfFileAndReturnError($());
      var output = $.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding).js.trim();
      console.log("✅ 系统外部引擎响应: " + output);
      console.log("📌 推荐架构: JXA 负责 Cocoa 文件读取/UI/剪贴板控制，涉及 WASM 解析的逻辑使用 JS 胶水层或通过 NSTask 极速管道交互。");
    } else {
      console.log("ℹ️ 未检测到外部 node 辅助引擎，可直接使用原生 Dynamic Library (.dylib) 模式加载算法。");
    }
  }
}