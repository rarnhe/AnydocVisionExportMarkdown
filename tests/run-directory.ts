import {copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import path from "node:path";
import {extractBatchOutput, safe, validateMarkdownBytes} from "./test-utils";

const root = process.cwd(), out = path.join(root, "tests/output"), input = path.join(out, "recursive-fixture");
const report = path.join(root, "test_report.md");
function run(name: string, cmd: string, args: string[]) {
  const result = spawnSync(cmd, args, {cwd: root, encoding: "utf8", timeout: 300000, maxBuffer: 24*1024*1024});
  const output = String(result.stdout || "") + "\n" + String(result.stderr || "");
  writeFileSync(path.join(out, "directory-" + name + ".log"), output, "utf8");
  if (result.status !== 0 || result.error) throw Error(name + " failed: " + safe(output.slice(-800)));
  return extractBatchOutput(output);
}
function hash(file: string): string {
  const bytes = readFileSync(file);
  validateMarkdownBytes(bytes);
  return createHash("sha256").update(bytes).digest("hex");
}
function main() {
  mkdirSync(out, {recursive:true});
  rmSync(input, {recursive:true, force:true});
  mkdirSync(path.join(input, "nested/deeper"), {recursive:true});
  copyFileSync(path.join(root, "tests/chunk_1.pdf"), path.join(input, "chunk_1.pdf"));
  copyFileSync(path.join(root, "tests/chunk_1.pdf"), path.join(input, "nested/deeper/copy.PDF"));
  writeFileSync(path.join(input, "nested/ignore.txt"), "ignored");
  const target = input + "_md";
  rmSync(target, {recursive:true, force:true});
  const build = spawnSync(process.execPath, ["build.js"], {cwd:root,encoding:"utf8",timeout:180000});
  if (build.status !== 0) throw Error("JXA bundle build failed: "+String(build.stderr));
  const bundle = path.join(root, "dist/anydoc-wasm.jxa.js");
  const modes = [
    {name:"node", cmd:"npx", args:["--no-install","tsx","src/hosts/node.ts"],runtime:"Node"},
    {name:"osascript", cmd:"osascript", args:["-l","JavaScript",bundle],runtime:"JXA"},
    {name:"executable",cmd:bundle,args:[],runtime:"JXA"}
  ];
  const hashes: string[] = [];
  const golden="2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131";
  for (const mode of modes) {
    rmSync(target,{recursive:true,force:true});
    const batch = run(mode.name,mode.cmd,[...mode.args,input]);
    if (batch.runtime !== mode.runtime || batch.conversionCount !== 2 ||
        batch.wasmInitializationCount !== 1 || batch.failureCount !== 0) {
      throw Error(mode.name + " conversion summary mismatch: " + JSON.stringify(batch));
    }
    const a = path.join(target,"chunk_1.md"), b = path.join(target,"nested/deeper/copy.md");
    if (!existsSync(a) || !existsSync(b) || existsSync(path.join(target,"nested/ignore.md"))) throw Error("Output layout mismatch");
    const ha=hash(a),hb=hash(b);
    if (ha!==hb || ha!==golden) throw Error("Same PDF output must match historical SHA256");
    const again=run(mode.name+"-skip",mode.cmd,[...mode.args,input]);
    if (again.conversionCount!==0 || again.skippedCount!==2 || again.wasmInitializationCount!==0) throw Error("Rerun must skip all Markdown without initializing WASM");
    if (hash(a)!==ha || hash(b)!==hb) throw Error("Skip changed existing Markdown");
    hashes.push(ha);
  }
  if (new Set(hashes).size !== 1) throw Error("Node/JXA recursive output differs");
  return "PASS: 3 runtimes, nested directory, 2 PDFs, one WASM init, identical SHA256 " + hashes[0];
}
try {
  const result=main();console.log(result);
  writeFileSync(report,"\n## 递归目录转换\n\n- "+result+"\n",{flag:"a"});
} catch (e) {
  const msg="FAIL: "+safe(e);console.error(msg);
  mkdirSync(out,{recursive:true});
  writeFileSync(report,"\n## 递归目录转换\n\n- "+msg+"\n",{flag:"a"});
  process.exitCode=1;
}
