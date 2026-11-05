import assert from "node:assert/strict";
import {readdirSync, readFileSync, statSync} from "node:fs";
import path from "node:path";
import {test} from "node:test";
import {
  ANYDOC_PREFIX, BATCH_PREFIX, PROBE_PREFIX,
  extractAnyDocResult, extractBatchOutput, extractProbeResult,
  mdEscape, safe, validateMarkdownBytes
} from "./test-utils";

const ROOT = process.cwd();
const TESTS = path.join(ROOT, "tests");

test("probe parser extracts JSON after diagnostic output", () => {
  const value = {schema: 1, globals: {ObjC: "undefined"}, capabilities: {}};
  assert.deepEqual(extractProbeResult("noise\n>> " + PROBE_PREFIX + JSON.stringify(value)), value);
});
test("probe parser skips malformed marker and accepts a later valid marker", () => {
  const value = {schema: 1, globals: {}, capabilities: {}};
  assert.deepEqual(extractProbeResult(PROBE_PREFIX + "{bad}\n" + PROBE_PREFIX + JSON.stringify(value)), value);
});
test("probe parser rejects missing marker and wrong schema", () => {
  assert.throws(() => extractProbeResult("ordinary output"), /Structured JSON marker/);
  assert.throws(() => extractProbeResult(PROBE_PREFIX + '{"schema":2,"globals":{},"capabilities":{}}'), /Structured JSON marker/);
});
test("Markdown report escaping handles pipes and newlines", () => {
  assert.equal(mdEscape("a|b\nc"), "a\\|b c");
});
test("AnyDoc parser accepts trailing output", () => {
  const value = {schema: 1, engine: "JXA", success: false};
  assert.deepEqual(extractAnyDocResult("noise\n" + ANYDOC_PREFIX + JSON.stringify(value) + "\ntrailing"), value);
});
test("AnyDoc parser rejects missing marker and invalid schema", () => {
  assert.throws(() => extractAnyDocResult("wasm unavailable"), /marker absent/);
  assert.throws(() => extractAnyDocResult(ANYDOC_PREFIX + '{"schema":2}'), /schema/);
});
test("batch parser accepts JXA and Node results", () => {
  const jxa = {schema: 1, runtime: "JXA", mode: "single-process", wasmInitializationCount: 1, conversionCount: 2, conversions: []};
  const node = {...jxa, runtime: "Node", conversionCount: 1};
  assert.deepEqual(extractBatchOutput("noise\n" + BATCH_PREFIX + JSON.stringify(jxa)), jxa);
  assert.deepEqual(extractBatchOutput(BATCH_PREFIX + JSON.stringify(node) + "\ntrailing"), node);
});
test("batch parser rejects missing marker and invalid schema", () => {
  assert.throws(() => extractBatchOutput("nothing"), /marker/);
  assert.throws(() => extractBatchOutput(BATCH_PREFIX + '{"schema":9}'), /schema/);
});
test("log sanitizer flattens lines and separators", () => {
  assert.equal(safe("error|failure\nline"), "error/failure line");
});
test("Markdown validator accepts UTF-8 and rejects short or placeholder content", () => {
  const bytes = new TextEncoder().encode("# 标题\n\n" + "这是一个足够长的 Markdown 测试内容，用于验证 UTF-8 文本可以正确解码并保留标题。".repeat(2));
  assert.match(validateMarkdownBytes(bytes).text, /^# 标题/);
  assert.throws(() => validateMarkdownBytes(new TextEncoder().encode("short")), /too short/);
  assert.throws(() => validateMarkdownBytes(new TextEncoder().encode("MARKDOWN_OUTPUT_START " + "x".repeat(50))), /Placeholder/);
});
test("PR #3 build and CLI source files exist", () => {
  for (const file of ["build.js", "src/node/cli.ts", "src/jxa/entry.ts", "src/core/anydoc-engine.ts", "src/jxa/cocoa-fs.ts"]) {
    assert.equal(statSync(path.join(ROOT, file)).isFile(), true, file);
  }
});
function filesUnder(dir: string): string[] {
  return readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}
test("application src tree contains TypeScript files only", () => {
  const files = filesUnder(path.join(ROOT, "src"));
  assert.ok(files.length > 0);
  assert.ok(files.every((file) => file.endsWith(".ts")));
});
test("tests tree contains no Python source", () => {
  assert.deepEqual(filesUnder(TESTS).filter((file) => file.endsWith(".py")), []);
});
test("real PDF fixture exists and has a valid header", () => {
  const pdf = readFileSync(path.join(TESTS, "chunk_1.pdf"));
  assert.ok(pdf.length > 100_000);
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
});
test("package build and doctor scripts are declared", () => {
  const source = readFileSync(path.join(ROOT, "build.js"), "utf8");
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.match(source, /anydoc-wasm\.jxa\.js/);
  assert.equal(pkg.scripts.build, "node build.js");
  assert.equal(pkg.scripts.doctor, "node scripts/doctor.cjs");
});
