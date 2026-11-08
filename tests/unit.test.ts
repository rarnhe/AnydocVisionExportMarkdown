import assert from "node:assert/strict";
import {readdirSync, readFileSync, statSync} from "node:fs";
import path from "node:path";
import {test} from "node:test";
import {
  BATCH_PREFIX, PROBE_PREFIX,
  extractBatchOutput, extractProbeResult,
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
test("batch parser accepts JXA and Node results", () => {
  const jxa = {schema: 1, runtime: "JXA", mode: "single-process", wasmInitializationCount: 1, conversionCount: 2, conversions: []};
  const node = {...jxa, runtime: "Node"};
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
test("TS to JXA ports/adapters template files exist", () => {
  for (const file of ["build.js", "package-lock.json", "src/hosts/node.ts", "src/hosts/jxa.ts", "src/core/engine.ts", "src/core/processor.ts", "src/ports/file-port.ts", "src/adapters/node-fs.ts", "src/adapters/cocoa-fs.ts"]) {
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
  assert.match(source, /anydoc-wasm\.osascript\.js/);
  assert.equal(pkg.scripts.build, "node build.js");
  assert.equal(pkg.scripts.doctor, "node tests/doctor.cjs");
});


test("CI uses reproducible npm ci with committed lockfile", () => {
  const workflow = readFileSync(path.join(ROOT, ".github/workflows/test_macos.yml"), "utf8");
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(path.join(ROOT, "package-lock.json"), "utf8"));
  assert.match(workflow, /npm ci/);
  assert.equal(lock.lockfileVersion, 3);
  assert.deepEqual(lock.packages[""].devDependencies, pkg.devDependencies);
});

test("production JXA entry and Node host share core but not host APIs", () => {
  const jxa = readFileSync(path.join(ROOT, "src/hosts/jxa.ts"), "utf8");
  const node = readFileSync(path.join(ROOT, "src/hosts/node.ts"), "utf8");
  const core = readFileSync(path.join(ROOT, "src/core/processor.ts"), "utf8");
  assert.match(jxa, /\.\.\/adapters\/cocoa-fs/);
  assert.match(node, /\.\.\/adapters\/node-fs/);
  assert.match(core, /\.\.\/ports\/file-port/);
  assert.doesNotMatch(core, /node:fs|ObjC|\.\/cocoa-fs/);
});

test("build and TSX development use one TypeScript asset loader", () => {
  const build = readFileSync(path.join(ROOT, "build.js"), "utf8");
  const loader = readFileSync(path.join(ROOT, "src/hosts/node-assets.ts"), "utf8");
  const jxa = readFileSync(path.join(ROOT, "src/hosts/jxa.ts"), "utf8");
  assert.match(build, /require\("tsx\/cjs"\)/);
  assert.match(build, /src\/hosts\/node-assets\.ts/);
  assert.match(loader, /require\.resolve\("@firecrawl\/anydoc-wasm"\)/);
  assert.match(loader, /esbuild\.transformSync/);
  assert.doesNotMatch(jxa, /node-assets|node:fs|require\(/);
  assert.equal(statSync(path.join(ROOT, "tests/doctor.cjs")).isFile(), true);
});

test("single PDF output numbering starts at -1 and never overwrites", async () => {
  const {planConversions,parseArguments} = await import("../src/core/processor");
  const {createNodeFilePort} = await import("../src/adapters/node-fs");
  const {mkdtempSync,writeFileSync,rmSync} = await import("node:fs");
  const dir=mkdtempSync(path.join(TESTS,"temp-single-"));
  try {
    const pdf=path.join(dir,"paper.PDF"),port=createNodeFilePort();
    writeFileSync(pdf,"pdf");
    assert.equal(planConversions([pdf],port)[0].output,path.join(dir,"paper.md"));
    writeFileSync(path.join(dir,"paper.md"),"old");
    assert.equal(planConversions([pdf],port)[0].output,path.join(dir,"paper-1.md"));
    writeFileSync(path.join(dir,"paper-1.md"),"old");
    assert.equal(planConversions([pdf],port)[0].output,path.join(dir,"paper-2.md"));
    assert.throws(()=>parseArguments([pdf,pdf]),/exactly one input/);
    assert.throws(()=>parseArguments(["--output-dir",dir]),/exactly one input/);
    assert.throws(()=>planConversions([path.join(dir,"missing.pdf")],port),/Expected a PDF file or existing directory/);
  } finally {rmSync(dir,{recursive:true,force:true});}
});
test("recursive folder creates a fresh _md tree on each run, suffix starts at space 2", async () => {
  const {planConversions} = await import("../src/core/processor");
  const {createNodeFilePort} = await import("../src/adapters/node-fs");
  const {mkdtempSync,mkdirSync,writeFileSync,rmSync} = await import("node:fs");
  const dir=mkdtempSync(path.join(TESTS,"temp-folder-"));
  try {
    mkdirSync(path.join(dir,"nested"),{recursive:true});
    writeFileSync(path.join(dir,"A.pdf"),"pdf");
    writeFileSync(path.join(dir,"nested","B.PDF"),"pdf");
    const port=createNodeFilePort();
    assert.deepEqual(planConversions([dir],port).map(x=>x.output),
      [dir+"_md/A.md",dir+"_md/nested/B.md"]);
    mkdirSync(dir+"_md");
    assert.equal(planConversions([dir],port)[0].output,dir+"_md 2/A.md");
    mkdirSync(dir+"_md 2");
    assert.equal(planConversions([dir],port)[0].output,dir+"_md 3/A.md");
    assert.throws(()=>planConversions([dir,dir],port),/exactly one input/);
  } finally {
    rmSync(dir,{recursive:true,force:true});
    for (const suffix of ["_md","_md 2","_md 3"]) rmSync(dir+suffix,{recursive:true,force:true});
  }
});
test("report aggregation is JavaScript-only and always runs", () => {
  const ci=readFileSync(path.join(ROOT,".github/workflows/test_macos.yml"),"utf8");
  assert.match(ci,/node tests\/summarize-ci\.cjs/);
  assert.doesNotMatch(ci,/python3/);
  assert.match(readFileSync(path.join(ROOT,"tests/summarize-ci.cjs"),"utf8"),/STAGE_DIRECTORY/);
});

test("TypeScript uses modern bundler resolution without suppressing deprecations", () => {
  const config=JSON.parse(readFileSync(path.join(ROOT,"tsconfig.json"),"utf8"));
  assert.equal(config.compilerOptions.module,"Preserve");
  assert.equal(config.compilerOptions.moduleResolution,"Bundler");
  assert.equal(config.compilerOptions.ignoreDeprecations,undefined);
});
test("build emits distinct osascript and Automator entrypoints", () => {
  const build=readFileSync(path.join(ROOT,"build.js"),"utf8");
  for (const name of ["anydoc-wasm.osascript.js","anydoc-wasm.automator.js"]) {
    assert.ok(build.includes(name), name);
  }
  assert.ok(build.includes("function run(argv)"));
  assert.ok(build.includes("function run(input, parameters)"));
  assert.ok(build.includes("JxaAnyDoc.run([posixPath])"));
  assert.ok(build.includes("return input;"));
  assert.equal(build.includes("anydoc-wasm.jxa.js"),false);
});

test("Automator build emits the engine outside its thin run adapter", () => {
  const build=readFileSync(path.join(ROOT,"build.js"),"utf8");
  assert.ok(build.includes("footer: {js: `"));
  assert.ok(build.includes("function run(input, parameters) {"));
  assert.ok(build.includes("JxaAnyDoc.run([posixPath])"));
  assert.ok(!build.includes("embeddedBundle.text"));
  assert.ok(!build.includes("const automatorSource = `function run"));
  assert.ok(!build.includes("write: false"));
});

test("Automator JXA object harness uses executable newlines and keeps original run", () => {
  const runner=readFileSync(path.join(ROOT,"tests/run-directory.ts"),"utf8");
  assert.ok(runner.includes("var __automatorOriginalRun = run;"));
  assert.ok(runner.includes("run = function(argv)"));
  assert.ok(runner.includes('Path(argv[0])'));
  assert.ok(!runner.includes('function run(argv) { return __automatorOriginalRun'));
});
