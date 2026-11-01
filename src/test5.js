#!/usr/bin/env osascript -l JavaScript

// test_wasm_jsc_fixed.js
// 运行方法: osascript -l JavaScript test_wasm_jsc_fixed.js ./anydoc_wasm_bg.wasm
// 验证能否使用wasm
ObjC.import('Foundation');

function run(argv) {
  if (!argv || argv.length < 1) {
    console.log("用法: osascript -l JavaScript test_wasm_jsc_fixed.js <path-to-wasm>");
    return;
  }

  var wasmPath = argv[0];
  console.log("==================================================");
  console.log("=== WASM 宿主环境诊断与 JSC 管道混合载入测试 ===");
  console.log("==================================================\n");

  // 1. 测试 JXA 原生环境
  console.log("[测试 1/3] 评估当前 JXA (osascript) 运行环境...");
  var hasJXAWebAssembly = (typeof WebAssembly !== "undefined");
  console.log(" - JXA 环境支持 WebAssembly: " + (hasJXAWebAssembly ? "✅ 是" : "❌ 否"));

  // 2. 探测系统内置 jsc
  console.log("\n[测试 2/3] 探测 macOS 内置 JavaScriptCore (jsc) 引擎...");
  var jscPath = "/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc";
  var fm = $.NSFileManager.defaultManager;
  
  if (!fm.fileExistsAtPath(jscPath)) {
    console.log("❌ 未能定位系统内置 jsc 路径: " + jscPath);
    return;
  }
  console.log(" ✅ 成功找到系统内置 JavaScriptCore 引擎: " + jscPath);

  // 3. 读取 WASM 并通过 Stdin 管道喂给 jsc
  console.log("\n[测试 3/3] 读取二进制 WASM 并通过 Stdin 管道送入 jsc 评估...");

  var wasmNSData = $.NSData.dataWithContentsOfFile(wasmPath);
  if (wasmNSData.isNil()) {
    console.log("❌ 无法读取文件: " + wasmPath);
    return;
  }

  var length = wasmNSData.length;
  console.log(" ✅ WASM 二进制读取成功，大小: " + length + " 字节");

  var b64Data = wasmNSData.base64EncodedStringWithOptions(0).js;

  // 构造通过 Stdin 输入给 jsc 运行的 JavaScript 代码
  var workerScript = `
    try {
      var b64 = "${b64Data}";
      var binStr = atob(b64);
      var bytes = new Uint8Array(binStr.length);
      for (var i = 0; i < binStr.length; i++) {
        bytes[i] = binStr.charCodeAt(i);
      }

      var module = new WebAssembly.Module(bytes.buffer);
      var instance = new WebAssembly.Instance(module, {});
      
      print("SUCCESS: WASM 模块编译与实例化成功！");
      print("EXPORTS: " + Object.keys(instance.exports).join(", "));
    } catch (e) {
      print("ERROR: " + e.message);
    }
  `;

  try {
    // 创建 NSTask 进程与双向管道
    var task = $.NSTask.alloc.init;
    var pipeIn = $.NSPipe.pipe;
    var pipeOut = $.NSPipe.pipe;

    // 兼容性更好的路径赋值与参数配置
    task.launchPath = jscPath;
    task.arguments = []; // 无需传命令行参数，从 stdin 读取
    task.standardInput = pipeIn;
    task.standardOutput = pipeOut;
    task.standardError = pipeOut;

    // 启动 jsc 进程
    task.launch;

    // 向 Stdin 管道写入脚本内容
    var scriptNSData = $.NSString.stringWithString(workerScript).dataUsingEncoding($.NSUTF8StringEncoding);
    pipeIn.fileHandleForWriting.writeData(scriptNSData);
    pipeIn.fileHandleForWriting.closeFile; // 关闭写入端触发 EOF

    // 等待 jsc 执行完成
    task.waitUntilExit;

    // 读取 jsc 的 Standard Output / Standard Error 输出
    var outData = pipeOut.fileHandleForReading.readDataToEndOfFile;
    var output = $.NSString.alloc.initWithDataEncoding(outData, $.NSUTF8StringEncoding).js.trim();

    console.log("\n--- jsc 引擎执行反馈 ---");
    console.log(output);
    console.log("-----------------------");

    if (output.indexOf("SUCCESS") !== -1) {
      console.log("\n🎉 方案验证成功！通过 JXA + Stdin 管道通信，成功在无外部依赖下完美加载与执行 WASM。");
    } else {
      console.log("\n❌ WASM 载入存在异常，请检查输出信息。");
    }

  } catch (err) {
    console.log("❌ 启动 jsc 管道捕获到致命异常: " + err.message);
  }
}