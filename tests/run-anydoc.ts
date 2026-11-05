import {createHash} from "node:crypto";
import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {AnyDocResult, extractAnyDocResult, safe, validateMarkdownBytes} from "./test-utils";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "tests", "output");
const REPORT = path.join(ROOT, "test_report.md");

interface RunResult { status: number; output: string; }
interface Evaluation {
  name: string; ok: boolean; phase: unknown; message: string;
  wasm_size: unknown; wasm_valid: unknown; glue_init: unknown;
  bytes: number | string; sha256: string; wasm_global: unknown; objc_global: unknown;
}
function run(command: string, args: string[], key: string, timeout = 240_000): RunResult {
  const result = spawnSync(command, args, {
    cwd: ROOT, encoding: "utf8", timeout, maxBuffer: 24 * 1024 * 1024, windowsHide: true
  });
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  const status = result.error ? -1 : (result.status ?? -1);
  const output = stdout + "\n" + stderr;
  writeFileSync(path.join(OUT, key + ".log"), [
    "command: " + [command, ...args].join(" "), "exit: " + status,
    "stdout-start:", stdout.slice(0, 1400), "stdout-end:", stdout.slice(-1400),
    "stderr-end:", stderr.slice(-6000), result.error ? "spawn-error: " + String(result.error) : ""
  ].join("\n"), "utf8");
  return {status, output};
}
function evaluate(key: "node-control" | "jxa-direct", command: string,
                  args: string[], expectedEngine: "Node" | "JXA"): Evaluation {
  const result = run(command, args, key);
  const state: Evaluation = {
    name: key, ok: false, phase: "startup", message: "",
    wasm_size: "-", wasm_valid: "-", glue_init: "-", bytes: "-",
    sha256: "-", wasm_global: "-", objc_global: "-"
  };
  try {
    const data: AnyDocResult = extractAnyDocResult(result.output);
    state.phase = data.phase ?? "-";
    state.message = String(data.message ?? "-");
    state.wasm_size = data.wasm_size ?? "-";
    state.wasm_valid = data.wasm_valid ?? "-";
    state.glue_init = data.glue_init ?? "-";
    state.wasm_global = data.wasm_global ?? "-";
    state.objc_global = data.objc_global ?? "-";
    if (result.status !== 0) throw new Error("Subprocess exit " + result.status);
    if (data.engine !== expectedEngine) throw new Error("Wrong runtime marker");
    if (data.mode !== "in-process (no NSTask/osascript/child_process)") throw new Error("Runtime was not direct");
    if (data.success !== true || data.phase !== "done") throw new Error("WASM conversion incomplete: " + String(data.message ?? ""));
    if (data.wasm_valid !== true || Number(data.wasm_size) < 100_000) throw new Error("Real WASM validation/size check failed");
    if (data.glue_init === undefined || data.glue_init === null || data.glue_init === "" || data.glue_init === "not_called") {
      throw new Error("Glue initSync not invoked");
    }
    if (data.converter !== "toMarkdownBytes") throw new Error("Real conversion function not invoked");
    if (typeof data.markdown !== "string") throw new Error("Markdown payload missing");
    const encoded = Buffer.from(data.markdown, "utf8");
    validateMarkdownBytes(encoded);
    state.sha256 = createHash("sha256").update(encoded).digest("hex");
    state.bytes = encoded.byteLength;
    writeFileSync(path.join(OUT, key + ".md"), encoded);
    state.ok = true;
    state.message = "Real PDF converted successfully";
  } catch (error) {
    state.message = safe(String(error)) + (state.phase === "startup" ? "; output=" + safe(result.output.slice(-600)) : "");
  }
  return state;
}
function appendReport(lines: string[]): void {
  if (!existsSync(REPORT)) writeFileSync(REPORT, "# JXA 测试报告\n", "utf8");
  writeFileSync(REPORT, "\n" + lines.join("\n") + "\n", {encoding: "utf8", flag: "a"});
}
function main(): number {
  mkdirSync(OUT, {recursive: true});
  const fixture = path.join(ROOT, "tests", "chunk_1.pdf");
  const rows: Array<Evaluation | {name: string; ok: boolean; phase: string; message: string}> = [];
  const fixtureValid = existsSync(fixture) && readFileSync(fixture).subarray(0, 5).toString("ascii") === "%PDF-";
  if (!fixtureValid) rows.push({name: "PDF fixture", ok: false, phase: "fixture", message: "Missing or invalid PDF"});
  const build = run("node", ["tests/build-anydoc.cjs"], "build-anydoc");
  rows.push({name: "AnyDoc glue build", ok: build.status === 0, phase: "build",
    message: build.status === 0 ? "Build OK" : safe(build.output.slice(-500))});
  const commands = [
    {key: "node-control" as const, command: process.execPath, args: [path.join(OUT, "node-control.js")], engine: "Node" as const},
    {key: "jxa-direct" as const, command: "osascript", args: ["-l", "JavaScript", path.join(OUT, "jxa-direct.js")], engine: "JXA" as const}
  ];
  for (const task of commands) {
    if (build.status !== 0 || !existsSync(path.join(OUT, task.key + ".js"))) {
      rows.push({name: task.key, ok: false, phase: "build", message: "Generated script missing"});
    } else rows.push(evaluate(task.key, task.command, task.args, task.engine));
  }
  const names = ["node-control", "jxa-direct"];
  const successful = rows.filter((row): row is Evaluation => row.ok && "sha256" in row);
  const matching = names.every((name) => successful.some((row) => row.name === name)) &&
    new Set(names.map((name) => successful.find((row) => row.name === name)?.sha256)).size === 1;
  const success = rows.every((row) => row.ok) && matching;
  const pdf = fixtureValid ? readFileSync(fixture) : undefined;
  const lines = [
    "## 真实 AnyDoc WebAssembly 转换（Node 对照 + JXA 原生执行）", "",
    "- 安装版本：@firecrawl/anydoc-wasm@0.2.4 + esbuild@0.28.2。",
    "- 输入文件：tests/chunk_1.pdf；" + (pdf ? "size=" + pdf.byteLength + " bytes; SHA256=" + createHash("sha256").update(pdf).digest("hex") : "missing"),
    "- 模式：JXA 在自己的进程直接构造真实 WASM Module、initSync 并调用 toMarkdownBytes；不启动 JSC 子进程。",
    "- Node 仅负责构建脚本和独立正向对照。",
    "- 总结论：**" + (success ? "PASS" : "FAIL") + "**", "",
    "| 测试 | 结果 | 阶段 | WASM 字节 | validate | wasm-bindgen 初始化 | Markdown 字节 | SHA256 | 说明 |",
    "|---|---|---|---:|---|---|---:|---|---|"
  ];
  for (const row of rows) {
    const item = row as Evaluation;
    lines.push("| " + safe(row.name) + " | " + (row.ok ? "PASS" : "FAIL") +
      " | " + safe(item.phase ?? "-") + " | " + safe(item.wasm_size ?? "-") +
      " | " + safe(item.wasm_valid ?? "-") + " | " + safe(item.glue_init ?? "-") +
      " | " + safe(item.bytes ?? "-") + " | " + safe(item.sha256 ?? "-") + " | " + safe(row.message) + " |");
  }
  lines.push("", "- Node 与 JXA 的真实 Markdown SHA256 完全一致：" + (matching ? "**PASS**" : "**FAIL / not verifiable**"),
    "- 真实转换必须完成 WASM validate、Module、initSync、toMarkdownBytes 和输出校验。",
    "- 日志：tests/output/build-anydoc.log、node-control.log、jxa-direct.log。",
    "- Markdown 保存在 Actions Artifact 的 tests/output/node-control.md 与 jxa-direct.md。",
    "- 本次是单次真实 PDF 转换；多文件单例复用由独立 singleton 测试覆盖。");
  appendReport(["", ...lines]);
  console.log(lines.join("\n"));
  return success ? 0 : 1;
}
try { process.exitCode = main(); }
catch (error) {
  mkdirSync(OUT, {recursive: true});
  appendReport(["## 真实 AnyDoc WebAssembly 转换", "", "- 结论：**FAIL**", "- Runner exception: " + safe(error)]);
  console.error(error);
  process.exitCode = 1;
}
