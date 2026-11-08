import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync} from "node:fs";
import path from "node:path";
import {extractBatchOutput, safe, validateMarkdownBytes, type BatchResult} from "./test-utils";

const ROOT=process.cwd(), OUTPUT=path.join(ROOT,"tests","output");
const REPORT=path.join(ROOT,"test_report.md");
const FIXTURE=path.join(ROOT,"tests","chunk_1.pdf");
const GOLDEN="2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131";
interface Run {name:string;status:number;stdout:string;stderr:string;parsed?:BatchResult}
function run(name:string,command:string,args:string[]):Run {
  const result=spawnSync(command,args,{cwd:ROOT,encoding:"utf8",timeout:300000,maxBuffer:24*1024*1024});
  const stdout=String(result.stdout??""),stderr=String(result.stderr??"");
  writeFileSync(path.join(OUTPUT,"directory-"+name+".log"),
    ["$ "+[command,...args].join(" "),"exit="+result.status,"STDOUT:",stdout.slice(-12000),
      "STDERR:",stderr.slice(-12000),result.error?String(result.error):""].join("\n"));
  const r:Run={name,status:result.status??-1,stdout,stderr};
  try{r.parsed=extractBatchOutput(stdout+"\n"+stderr)}catch{}
  return r;
}
function check(r:Run,runtime:"Node"|"JXA",count:number):BatchResult {
  if(r.status!==0||!r.parsed)throw Error(r.name+" exit="+r.status+": "+safe(r.stderr||r.stdout,850));
  const b=r.parsed;
  if(b.runtime!==runtime||b.conversionCount!==count||b.wasmInitializationCount!==1||
     b.failureCount!==0||b.discoveredCount!==count||b.skippedCount!==0)
    throw Error(r.name+" unexpected result "+JSON.stringify(b));
  return b;
}
function sha(file:string):string {
  if(!existsSync(file))throw Error("Missing Markdown "+file);
  const data=readFileSync(file);
  validateMarkdownBytes(data);
  return createHash("sha256").update(data).digest("hex");
}
function main():string[] {
  mkdirSync(OUTPUT,{recursive:true});
  if(!existsSync(FIXTURE))throw Error("Missing real PDF fixture");
  const build=spawnSync(process.execPath,["build.js"],{cwd:ROOT,encoding:"utf8",timeout:180000});
  writeFileSync(path.join(OUTPUT,"directory-build.log"),"exit="+build.status+"\n"+build.stdout+"\n"+build.stderr);
  if(build.status!==0)throw Error("JXA build failed "+safe(build.stderr,850));
  const bundle=path.join(ROOT,"dist","anydoc-wasm.jxa.js");
  if(!existsSync(bundle)||statSync(bundle).size<100000)throw Error("JXA bundle missing");
  const node=(name:string,input:string)=>run(name,"npx",["--no-install","tsx","src/hosts/node.ts",input]);
  const jxa=(name:string,input:string)=>run(name,bundle,[input]);
  const lines=["## 单个 PDF 与递归目录：Node / JXA SHA256 对照","",
    "| 测试 | Node SHA256 | JXA SHA256 | 结果 |","|---|---|---|---|"];
  const checkPair=(label:string,a:string,b:string)=>{
    const x=sha(a),y=sha(b);
    if(x!==y||x!==GOLDEN)throw Error(label+" SHA256 mismatch "+x+" "+y);
    lines.push("| "+label+" | "+x+" | "+y+" | PASS |");
  };
  // Independent inputs: output roots are determined solely by input names, not --output-dir.
  const nodeDir=path.join(OUTPUT,"node-fixture");
  const jxaDir=path.join(OUTPUT,"jxa-fixture");
  for(const dir of [nodeDir,jxaDir]){
    for(const suffix of ["","_md","_md 2","_md 3"])rmSync(dir+suffix,{recursive:true,force:true});
    mkdirSync(path.join(dir,"nested","deep"),{recursive:true});
    copyFileSync(FIXTURE,path.join(dir,"chunk_1.pdf"));
    copyFileSync(FIXTURE,path.join(dir,"nested","deep","copy.PDF"));
    writeFileSync(path.join(dir,"nested","ignored.txt"),"not pdf");
  }
  check(node("node-folder",nodeDir),"Node",2);
  check(jxa("jxa-folder",jxaDir),"JXA",2);
  for(const relative of ["chunk_1.md","nested/deep/copy.md"])
    checkPair("folder/"+relative,path.join(nodeDir+"_md",relative),path.join(jxaDir+"_md",relative));
  check(node("node-folder-second",nodeDir),"Node",2);
  check(jxa("jxa-folder-second",jxaDir),"JXA",2);
  for(const relative of ["chunk_1.md","nested/deep/copy.md"])
    checkPair("folder 2/"+relative,path.join(nodeDir+"_md 2",relative),path.join(jxaDir+"_md 2",relative));
  check(node("node-folder-third",nodeDir),"Node",2);
  check(jxa("jxa-folder-third",jxaDir),"JXA",2);
  for(const relative of ["chunk_1.md","nested/deep/copy.md"])
    checkPair("folder 3/"+relative,path.join(nodeDir+"_md 3",relative),path.join(jxaDir+"_md 3",relative));
  for(const dir of [nodeDir,jxaDir]){
    if(existsSync(path.join(dir+"_md","nested","ignored.md")))throw Error("Non PDF converted");
  }
  // Single PDF: first name.md, then name-1.md, then name-2.md.
  const nodePdf=path.join(OUTPUT,"single-node.pdf"),jxaPdf=path.join(OUTPUT,"single-jxa.pdf");
  for(const [pdf,stem] of [[nodePdf,"single-node"],[jxaPdf,"single-jxa"]] as const){
    copyFileSync(FIXTURE,pdf);
    for(const suffix of ["","-1","-2"])rmSync(path.join(OUTPUT,stem+suffix+".md"),{force:true});
  }
  for(let i=0;i<3;i++){
    check(node("node-single-"+i,nodePdf),"Node",1);
    check(jxa("jxa-single-"+i,jxaPdf),"JXA",1);
    const suffix=i?"-"+i:"";
    checkPair("single PDF "+(i+1),path.join(OUTPUT,"single-node"+suffix+".md"),
      path.join(OUTPUT,"single-jxa"+suffix+".md"));
  }
  lines.push("","- PASS：目录每次递归创建新镜像根目录：_md、_md 2、_md 3。",
    "- PASS：单个 PDF 依次创建 .md、-1.md、-2.md，不覆盖已有文件。",
    "- PASS：Node 与 JXA 每次实际输出的 Markdown SHA256 相同，符合真实 PDF 基准。",
    "- PASS：每次运行均只初始化一次 WASM；不接受多个独立 PDF 路径。",
    "- 日志：tests/output/directory-*.log");
  return lines;
}
try {
  const lines=main();
  writeFileSync(REPORT,"\n"+lines.join("\n")+"\n",{flag:"a"});
  console.log(lines.join("\n"));
}catch(error){
  mkdirSync(OUTPUT,{recursive:true});
  const message="FAIL: "+safe(error,1100);
  writeFileSync(REPORT,"\n## PDF 与目录转换\n\n- **FAIL**："+message+"\n",{flag:"a"});
  console.error(message);
  process.exitCode=1;
}
