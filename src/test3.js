#!/usr/bin/env osascript -l JavaScript

// test3.js (内存安全版)
// 运行方法: osascript -l JavaScript test3.js

ObjC.import('Foundation');

function run() {
  console.log("=== POC 3 (内存安全版): 50MB 二进制桥接性能测试 ===");

  // 1. 创建 50MB 测试内存 (NSData)
  var testSize = 50 * 1024 * 1024;
  console.log("正在准备 " + (testSize / (1024 * 1024)) + " MB 测试数据...");
  
  var mutData = $.NSMutableData.dataWithLength(testSize);
  
  // Cocoa 极速原生内存填充 (零 FFI 指针风险)
  mutData.resetBytesInRange($.NSMakeRange(0, testSize));

  console.log("开始测试内存安全的大数据量桥接性能...");

  var t0 = Date.now();

  // 2. 避免直接对 ArrayBuffer 使用 FFI memcpy（避免 Segfault）
  // 采用 Cocoa C 级 Base64 管道中转（内存绝对安全）
  var b64Str = mutData.base64EncodedStringWithOptions(0).js;
  
  // 转换为二进制字符串
  var binStr = $($.NSString.alloc.initWithDataEncoding(
    $.NSData.alloc.initWithBase64EncodedStringOptions(b64Str, 0),
    $.NSASCIIStringEncoding
  )).js;

  // 填充 JS 原生 ArrayBuffer
  var fastBuffer = new ArrayBuffer(testSize);
  var view = new Uint8Array(fastBuffer);
  
  for (var i = 0; i < testSize; i++) {
    view[i] = binStr.charCodeAt(i);
  }

  var t1 = Date.now();
  var fastTime = t1 - t0;

  console.log("✅ 内存安全桥接 [50 MB] 耗时: " + fastTime + " ms");
  console.log("✅ 状态: 零 Segmentation Fault，成功导入 JS 内存！");
}