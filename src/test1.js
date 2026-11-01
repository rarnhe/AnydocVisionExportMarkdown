#!/usr/bin/env osascript -l JavaScript

// poc1_env_check.js
// 运行方法: osascript -l JavaScript poc1_env_check.js

function run() {
  var report = {
    jxaVersion: "JavaScriptCore (macOS " + $.NSProcessInfo.processInfo.operatingSystemVersionString.js + ")",
    hasWebAssembly: typeof WebAssembly !== "undefined",
    hasTextDecoder: typeof TextDecoder !== "undefined",
    hasTextEncoder: typeof TextEncoder !== "undefined",
    hasBuffer: typeof Buffer !== "undefined"
  };

  console.log("=== POC 1: JXA 基础运行环境能力检测 ===");
  console.log("OS 版本: " + report.jxaVersion);
  console.log("WebAssembly 全局对象: " + (report.hasWebAssembly ? "✅ 支持" : "❌ 不支持 (必须改用 AppleScript 挂载 C 动态库)"));
  console.log("TextDecoder: " + (report.hasTextDecoder ? "✅ 支持" : "❌ 不存在 (确认为非 Web 环境)"));
  console.log("TextEncoder: " + (report.hasTextEncoder ? "✅ 支持" : "❌ 不存在 (确认为非 Web 环境)"));

  if (!report.hasWebAssembly) {
    throw new Error("Fatal: 当前 JXA 环境未暴露 WebAssembly 全局对象！");
  }

  return JSON.stringify(report, null, 2);
}