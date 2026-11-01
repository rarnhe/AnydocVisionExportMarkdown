#!/usr/bin/env osascript -l JavaScript

// poc4_cocoa_decoder.js
// 运行方法: osascript -l JavaScript poc4_cocoa_decoder.js

ObjC.import('Foundation');

function run() {
  console.log("=== POC 4: Cocoa NSString 纯二进制解码与输出测试 ===");

  // 1. 模拟从 WASM 返回的包含复杂 UTF-8 字符 (如 Emoji, 中文, Markdown 标签) 的 Uint8Array
  var rawMarkdown = "# 厂务系统 Accept Test 报告\n\n- **设备**: 洁净室 PCW 泵组\n- **状态**: ✅ 振动 VC-C 标准达标\n- **说明**: 采样频率 1000Hz，无异常谐波。";
  
  // 转为 Native NSData 模拟内存生成
  var nsStringInput = $.NSString.stringWithString(rawMarkdown);
  var nsDataInput = nsStringInput.dataUsingEncoding($.NSUTF8StringEncoding);
  
  // 2. 模拟由 ArrayBuffer 构建 NSData 并用 NSString 无损解码
  var bufferLength = nsDataInput.length;
  console.log("处理 UTF-8 字节流大小: " + bufferLength + " bytes");

  // Cocoa 管道无缝转码 (完全摒弃 TextDecoder)
  var decodedString = $.NSString.alloc.initWithDataEncoding(nsDataInput, $.NSUTF8StringEncoding).js;

  console.log("\n--- 解码得到的 JXA 字符串 ---");
  console.log(decodedString);
  console.log("-----------------------------\n");

  // 3. 将字符串安全导出保存为 Markdown 文件
  var outputPath = "/tmp/anydoc_jxa_test_output.md";
  var nsOutString = $.NSString.stringWithString(decodedString);
  var success = nsOutString.writeToFileAtomicallyEncodingError(
    outputPath, 
    true, 
    $.NSUTF8StringEncoding, 
    null
  );

  if (success) {
    console.log("✅ 成功落盘写入本地文件: " + outputPath);
  } else {
    console.log("❌ 写入文件失败！");
  }
}