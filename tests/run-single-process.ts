import {createHash} from "node:crypto";
import {copyFileSync,existsSync,mkdirSync,readFileSync,rmSync,statSync,writeFileSync} from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {extractBatchOutput,safe,validateMarkdownBytes} from "./test-utils";

const root=process.cwd(), out=path.join(root,"tests/output"), dir=path.join(out,"singleton");
const reportPath=path.join(root,"test_report.md");
const golden="2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131";
type Row={name:string;pass:boolean;reason:string;initializations?:number|string;converted?:number|string;bytes?:number|string;md5?:string;sha256?:string};
function run(key:string,cmd:string,args:string[]){
 const r=spawnSync(cmd,args,{cwd:root,encoding:"utf8",timeout:300000,maxBuffer:24*1024*1024});
 const stdout=typeof r.stdout==="string"?r.stdout:"",stderr=typeof r.stderr==="string"?r.stderr:"";
 const status=r.error?-1:(r.status??-1),output=stdout+"\n"+stderr;
 writeFileSync(path.join(out,key+".log"),["$ "+[cmd,...args].join(" "),"exit="+status,"STDOUT:",stdout.slice(-12000),"STDERR:",stderr.slice(-12000),r.error?String(r.error):""].join("\n"),"utf8");
 return {status,output};
}
function digest(file:string){
 if(!existsSync(file))throw Error("Missing Markdown: "+file);
 const bytes=readFileSync(file),valid=validateMarkdownBytes(bytes);
 for(const marker of ["Direct JXA Export","Executed without WASM","MARKDOWN_OUTPUT_START","MARKDOWN_OUTPUT_END","ERROR:","ANYDOC_BATCH_JSON="])
  if(valid.text.includes(marker))throw Error("Placeholder/error Markdown: "+file);
 return {bytes:bytes.length,md5:createHash("md5").update(bytes).digest("hex"),sha256:createHash("sha256").update(bytes).digest("hex")};
}
function append(lines:string[]){
 if(!existsSync(reportPath))writeFileSync(reportPath,"# JXA 测试报告\n","utf8");
 writeFileSync(reportPath,"\n"+lines.join("\n")+"\n",{encoding:"utf8",flag:"a"});
}
function main(){
 mkdirSync(out,{recursive:true});rmSync(dir,{recursive:true,force:true});mkdirSync(dir,{recursive:true});
 const pdf=path.join(root,"tests/chunk_1.pdf"),copy=path.join(dir,"chunk_1_copy.pdf"),rows:Row[]=[];
 if(existsSync(pdf)&&readFileSync(pdf).subarray(0,5).toString("ascii")==="%PDF-")copyFileSync(pdf,copy);
 else rows.push({name:"PDF fixture",pass:false,reason:"Missing/invalid tests/chunk_1.pdf"});
 const build=run("singleton-build",process.execPath,["build.js"]),bundle=path.join(root,"dist/anydoc-wasm.jxa.js");
 const built=build.status===0&&existsSync(bundle)&&statSync(bundle).size>100000;
 rows.push({name:"build",pass:built,reason:built?"Bundle generated, size="+statSync(bundle).size:"Build failed: "+safe(build.output.slice(-500))});
 const modes=[
  {name:"node-tsx",cmd:"npx",args:["--no-install","tsx","src/hosts/node.ts"],runtime:"Node"},
  {name:"jxa-osascript",cmd:"osascript",args:["-l","JavaScript",bundle],runtime:"JXA"},
  {name:"jxa-executable",cmd:bundle,args:[],runtime:"JXA"}
 ];
 const hashes:string[]=[];
 for(const mode of modes){
  const dest=path.join(dir,mode.name);mkdirSync(dest,{recursive:true});
  const row:Row={name:mode.name,pass:false,reason:"-",initializations:"-",converted:"-",bytes:"-",md5:"-",sha256:"-"};
  if(!existsSync(copy))row.reason="PDF fixture unavailable";
  else if(mode.runtime==="JXA"&&!built)row.reason="JXA bundle build failed";
  else{
   const result=run("singleton-"+mode.name,mode.cmd,[...mode.args,"--output-dir",dest,pdf,copy]);
   try{
    if(result.status!==0)throw Error("Exit "+result.status+": "+safe(result.output.slice(-600)));
    const batch=extractBatchOutput(result.output);
    row.initializations=batch.wasmInitializationCount;row.converted=batch.conversionCount;
    if(batch.runtime!==mode.runtime||batch.mode!=="single-process")throw Error("Wrong runtime/process mode");
    if(batch.wasmInitializationCount!==1)throw Error("Expected exactly one WASM init");
    if(batch.conversionCount!==2||batch.conversions.length!==2)throw Error("Expected two PDF conversions");
    const a=digest(path.join(dest,"chunk_1.md")),b=digest(path.join(dest,"chunk_1_copy.md"));
    if(a.md5!==b.md5)throw Error("Same PDF inputs produced different MD5");
    Object.assign(row,a);row.reason="2 PDFs converted in one process; one WASM initialization";row.pass=true;hashes.push(a.md5);
   }catch(e){row.reason=safe(e);}
  }
  rows.push(row);
 }
 const equal=hashes.length===3&&new Set(hashes).size===1;
 const baseline=modes.every(m=>rows.find(r=>r.name===m.name)?.sha256===golden);
 const passed=rows.every(r=>r.pass)&&equal&&baseline;
 const lines=["## JXA 单进程 + ObjC 文件系统 + WASM 单例：真实 PDF 转 Markdown","",
 "- Node/tsx 与 JXA 共用 TypeScript WASM 引擎；JXA 运行时仅 Foundation + WASM，不启动外部解释器或子进程。",
 "- 每个进程处理原始 PDF 与同字节副本，断言 WASM 初始化 1 次、转换 2 次。",
 "- Node TSX、JXA osascript、JXA 可执行文件生成的 Markdown MD5 必须一致。",
 "- 历史真实 AnyDoc SHA256 基准："+golden,"- 结论：**"+(passed?"PASS":"FAIL")+"**","",
 "| 步骤 | 结果 | WASM init | PDF count | bytes | MD5 | SHA256 | 详情 |",
 "|---|---|---:|---:|---:|---|---|---|"];
 for(const r of rows)lines.push("| "+safe(r.name)+" | "+(r.pass?"PASS":"FAIL")+" | "+(r.initializations??"-")+" | "+(r.converted??"-")+" | "+(r.bytes??"-")+" | "+(r.md5??"-")+" | "+(r.sha256??"-")+" | "+safe(r.reason)+" |");
 lines.push("","- 三种运行时 MD5 完全一致："+(equal?"**PASS**":"**FAIL**"),"- 历史 SHA256 基准一致："+(baseline?"**PASS**":"**FAIL**"),"- Markdown 与日志保存在 tests/output/ 并上传为 Actions Artifact。");
 append(lines);console.log(lines.join("\n"));return passed?0:1;
}
try{process.exitCode=main();}catch(e){mkdirSync(out,{recursive:true});append(["## 单进程 WASM 测试","","- 结论：**FAIL**","- Runner exception: "+safe(e)]);console.error(e);process.exitCode=1;}
