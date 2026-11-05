import {existsSync, mkdirSync, writeFileSync} from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {CapabilityResult, extractProbeResult, mdEscape} from "./test-utils";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "tests", "output");
const REPORT = path.join(ROOT, "test_report.md");
const STATUSES = new Set(["supported", "unavailable", "error", "not_tested"]);

function run(command: string, args: string[], log: string, timeout = 90_000) {
  const result = spawnSync(command, args, {cwd: ROOT, encoding: "utf8", timeout,
    maxBuffer: 16 * 1024 * 1024, windowsHide: true});
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  const status = result.error ? -1 : (result.status ?? -1);
  const output = stdout + "\n" + stderr;
  writeFileSync(path.join(OUT, log), [
    "$ " + [command, ...args].join(" "), "exit=" + status,
    "STDOUT:", stdout, "STDERR:", stderr,
    result.error ? "SPAWN ERROR: " + String(result.error) : ""
  ].join("\n"), "utf8");
  return {status, output};
}
function environment(): string {
  if (process.platform !== "darwin") return process.platform + " " + process.arch;
  const result = spawnSync("sw_vers", [], {encoding: "utf8", timeout: 10_000});
  return (typeof result.stdout === "string" ? result.stdout : "")
    .trim().replace(/\r?\n/g, "; ") || "macOS";
}
function validCapabilities(data: CapabilityResult): boolean {
  return Object.keys(data.capabilities).length > 0 &&
    Object.values(data.capabilities).every((item) => STATUSES.has(item.status));
}
function main(): number {
  mkdirSync(OUT, {recursive: true});
  const errors: string[] = [];
  const unit = run("npm", ["run", "test:unit"], "unit-tests.log", 180_000);
  if (unit.status !== 0) errors.push("Node.js TypeScript unit tests failed; see unit-tests.log");

  let jxa: CapabilityResult | undefined;
  const result = run("osascript", ["-l", "JavaScript", "tests/probe.js"], "jxa.log");
  if (result.status !== 0) errors.push("JXA process failed (exit=" + result.status + ")");
  else {
    try {
      const data = extractProbeResult(result.output);
      if (!validCapabilities(data)) throw new Error("Empty or invalid capability map");
      jxa = data;
    } catch (error) {
      errors.push("JXA invalid output: " + String(error));
    }
  }

  const globals = jxa?.globals ?? {};
  const capabilities = jxa?.capabilities ?? {};
  const lines = [
    "# JXA — macOS 能力边界实测", "",
    "- 测试时间 (UTC): " + new Date().toISOString(),
    "- 系统: " + mdEscape(environment()),
    "- Node.js: " + mdEscape(process.version),
    "- GitHub SHA: " + mdEscape(process.env.GITHUB_SHA ?? "local"),
    "- GitHub Run: " + mdEscape(process.env.GITHUB_RUN_ID ?? "local"),
    "", "## 测试状态", "",
    "| 测试 | 结果 | 日志 |", "|---|---|---|",
    "| Node.js TypeScript 单元测试 | " + (unit.status === 0 ? "PASS" : "FAIL") + " | tests/output/unit-tests.log |",
    "| JXA 原生能力探针 | " + (jxa ? "PASS" : "FAIL") + " | tests/output/jxa.log |",
    "", "PASS 表示宿主进程运行且结果结构有效，不代表全部 API 均可使用。",
    "unavailable: 宿主未暴露 API；error: API 存在但调用失败；not_tested: 涉及授权/交互而主动跳过。",
    "", "## JXA 全局接口类型 (typeof)", "", "| Global | JXA |", "|---|---|"
  ];
  for (const key of Object.keys(globals).sort()) {
    lines.push("| " + mdEscape(key) + " | " + mdEscape(globals[key]) + " |");
  }
  lines.push("", "## JXA 能力边界矩阵", "", "| 能力 | 状态 | 详情 |", "|---|---|---|");
  for (const key of Object.keys(capabilities).sort()) {
    lines.push("| " + mdEscape(key) + " | " + mdEscape(capabilities[key].status) +
      " | " + mdEscape(capabilities[key].detail) + " |");
  }
  lines.push("", "## 测量限制", "",
    "- WASM 功能探针使用最小模块，真实 AnyDoc WASM 转换由独立测试验证。",
    "- WASM compile/instantiate 的异步及 streaming API 只检查存在性，不等待 Promise。",
    "- Foundation FS 探针尝试在临时目录写入、读取、删除文件。",
    "- Application.currentApplication() 仅证明当前应用代理可构造，不证明跨应用控制权。",
    "- CI 不主动访问 Finder 或 System Events：其他应用的 Apple Events/TCC 授权未测试。",
    "- AppKit 桥接不等于拥有可用图形会话；测试结果随 macOS 版本变化。",
    "", "## 失败项", "");
  lines.push(...(errors.length ? errors.map((error) => "- " + mdEscape(error)) : ["- 无"]));
  lines.push("", "完整 stdout/stderr 见 GitHub Actions 上传的 tests/output/ 日志。", "");
  writeFileSync(REPORT, lines.join("\n"), "utf8");
  console.log(lines.join("\n"));
  return errors.length ? 1 : 0;
}
try { process.exitCode = main(); }
catch (error) {
  mkdirSync(OUT, {recursive: true});
  writeFileSync(REPORT, "# JXA — macOS 能力边界实测\n\n- 结论：**FAIL**\n- Runner exception: " + mdEscape(error) + "\n", "utf8");
  console.error(error);
  process.exitCode = 1;
}
