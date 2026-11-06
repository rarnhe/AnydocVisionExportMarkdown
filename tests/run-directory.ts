import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync} from "node:fs";
import path from "node:path";
import {extractBatchOutput, safe, validateMarkdownBytes, type BatchResult} from "./test-utils";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "tests", "output");
const REPORT = path.join(ROOT, "test_report.md");
const FIXTURE = path.join(ROOT, "tests", "chunk_1.pdf");
const INPUT = path.join(OUTPUT, "directory-fixture");
const GOLDEN = "2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131";

interface Run {name: string; status: number; stdout: string; stderr: string; parsed?: BatchResult}
function run(name: string, command: string, args: string[]): Run {
  const result = spawnSync(command, args, {
    cwd: ROOT, encoding: "utf8", timeout: 300000, maxBuffer: 24 * 1024 * 1024
  });
  const stdout = String(result.stdout ?? ""), stderr = String(result.stderr ?? "");
  writeFileSync(path.join(OUTPUT, "directory-" + name + ".log"),
    ["$ " + [command, ...args].join(" "), "exit=" + result.status,
      "STDOUT:", stdout.slice(-12000), "STDERR:", stderr.slice(-12000),
      result.error ? String(result.error) : ""].join("\n"));
  const run: Run = {name, status: result.status ?? -1, stdout, stderr};
  try { run.parsed = extractBatchOutput(stdout + "\n" + stderr); }
  catch { /* preserve full logs and report a missing protocol below */ }
  return run;
}
function checkRun(result: Run, runtime: "Node" | "JXA", converted: number, skipped: number, init: number): BatchResult {
  if (result.status !== 0 || !result.parsed) {
    throw new Error(result.name + " exit=" + result.status + ": " + safe(result.stderr || result.stdout, 750));
  }
  const batch = result.parsed;
  if (batch.runtime !== runtime || batch.conversionCount !== converted ||
      batch.skippedCount !== skipped || batch.wasmInitializationCount !== init ||
      batch.failureCount !== 0 || batch.discoveredCount !== 2) {
    throw new Error(result.name + " unexpected counters: " + JSON.stringify(batch));
  }
  return batch;
}
function sha(file: string): string {
  if (!existsSync(file)) throw new Error("Expected Markdown missing: " + file);
  const contents = readFileSync(file);
  validateMarkdownBytes(contents);
  return createHash("sha256").update(contents).digest("hex");
}
function main(): string[] {
  mkdirSync(OUTPUT, {recursive: true});
  if (!existsSync(FIXTURE)) throw new Error("Real PDF fixture missing");
  rmSync(INPUT, {recursive: true, force: true});
  mkdirSync(path.join(INPUT, "nested", "deep"), {recursive: true});
  copyFileSync(FIXTURE, path.join(INPUT, "chunk_1.pdf"));
  copyFileSync(FIXTURE, path.join(INPUT, "nested", "deep", "copy.PDF"));
  writeFileSync(path.join(INPUT, "nested", "ignored.txt"), "ignore me");
  const build = spawnSync(process.execPath, ["build.js"], {cwd:ROOT, encoding:"utf8", timeout:180000});
  writeFileSync(path.join(OUTPUT, "directory-build.log"),
    "exit=" + build.status + "\n" + String(build.stdout) + "\n" + String(build.stderr));
  if (build.status !== 0) throw new Error("JXA build failed: " + safe(build.stderr, 800));
  const bundle = path.join(ROOT, "dist", "anydoc-wasm.jxa.js");
  if (!existsSync(bundle) || statSync(bundle).size < 100000) throw new Error("Standalone JXA bundle missing");

  const nodeDir = path.join(OUTPUT, "node-markdown");
  const jxaDir = path.join(OUTPUT, "jxa-markdown");
  rmSync(nodeDir, {recursive:true,force:true});
  rmSync(jxaDir, {recursive:true,force:true});
  const nodeArgs = ["--no-install", "tsx", "src/hosts/node.ts", "--output-dir", nodeDir, INPUT];
  const jxaArgs = ["--output-dir", jxaDir, INPUT];
  const node = run("node", "npx", nodeArgs);
  const jxa = run("jxa", bundle, jxaArgs);
  checkRun(node, "Node", 2, 0, 1);
  checkRun(jxa, "JXA", 2, 0, 1);

  const relative = ["chunk_1.md", "nested/deep/copy.md"];
  const lines = [
    "## 真实目录镜像转换：Node 开发模式 vs JXA 执行模式", "",
    "- 输入：包含同一真实 PDF 的两层目录，额外包含非 PDF 文件。",
    "- 校验：两个独立目录树；WASM 每进程只初始化一次；输出目录保持层级。", "",
    "| 对应文件 | Node SHA256 | JXA SHA256 | 一致 |", "|---|---|---|---|"
  ];
  for (const rel of relative) {
    const nodeHash = sha(path.join(nodeDir, rel)), jxaHash = sha(path.join(jxaDir, rel));
    if (nodeHash !== jxaHash || nodeHash !== GOLDEN) {
      throw new Error("Node/JXA SHA256 mismatch or historical baseline regression for " + rel +
        " node=" + nodeHash + " jxa=" + jxaHash);
    }
    lines.push("| " + rel + " | " + nodeHash + " | " + jxaHash + " | PASS |");
  }
  if (existsSync(path.join(nodeDir,"nested","ignored.md")) ||
      existsSync(path.join(jxaDir,"nested","ignored.md"))) throw Error("Non-PDF copied into mirror");

  // Repeat both modes: old Markdown files must remain byte-for-byte identical.
  const before = relative.map(rel => [sha(path.join(nodeDir,rel)),sha(path.join(jxaDir,rel))]);
  checkRun(run("node-rerun", "npx", nodeArgs), "Node", 0, 2, 0);
  checkRun(run("jxa-rerun", bundle, jxaArgs), "JXA", 0, 2, 0);
  for (let i=0;i<relative.length;i++) {
    const rel=relative[i];
    if (sha(path.join(nodeDir,rel))!==before[i][0] || sha(path.join(jxaDir,rel))!==before[i][1])
      throw Error("Existing Markdown changed during skipped conversion: " + rel);
  }
  lines.push("", "- **PASS**：Node 与 JXA 的两个对应 Markdown SHA256 完全相同。",
    "- **PASS**：两种模式第一次处理 2 PDF / 1 WASM 初始化，第二次跳过 2 PDF / 0 WASM 初始化。",
    "- **PASS**：历史真实 AnyDoc SHA256 基准 " + GOLDEN,
    "- 详细命令输出：tests/output/directory-*.log");
  return lines;
}
try {
  const lines=main();
  writeFileSync(REPORT, "\n"+lines.join("\n")+"\n", {flag:"a"});
  console.log(lines.join("\n"));
} catch (error) {
  mkdirSync(OUTPUT,{recursive:true});
  const message="FAIL: " + safe(error,1000);
  writeFileSync(REPORT, "\n## 真实目录镜像转换\n\n- **FAIL**：" + message +
    "\n- 详细日志：tests/output/directory-*.log\n", {flag:"a"});
  console.error(message);
  process.exitCode=1;
}
