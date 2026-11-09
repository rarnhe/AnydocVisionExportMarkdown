import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {copyFileSync,existsSync,mkdirSync,readFileSync,rmSync,statSync,writeFileSync} from "node:fs";
import path from "node:path";
import {extractBatchOutput} from "./test-utils";
const root=process.cwd(),out=path.join(root,"tests/output"),source=path.join(root,"tests2/origin.pdf");
function sha(p:string){return createHash("sha256").update(readFileSync(p)).digest("hex");}
function invoke(label:string,input:string){
  const run=spawnSync("osascript",["-l","JavaScript",path.join(root,"dist/anydoc-wasm.osascript.js"),input],
    {cwd:root,encoding:"utf8",timeout:900000,maxBuffer:16*1024*1024});
  writeFileSync(path.join(out,"ocr-"+label+".log"),
    "exit="+run.status+"\n"+run.stdout+"\n"+run.stderr);
  if(run.status!==0)throw Error(label+" osascript failed: "+run.stderr);
  const result=extractBatchOutput(String(run.stdout)+"\n"+String(run.stderr));
  if(result.failureCount||result.conversionCount!==1||result.wasmInitializationCount!==1)
    throw Error(label+" bad result "+JSON.stringify(result));
  return result.conversions[0].output;
}
mkdirSync(out,{recursive:true});
try {
  if(!existsSync(source))throw Error("Missing tests2/origin.pdf fixture");
  const build=spawnSync(process.execPath,["build.js"],{cwd:root,encoding:"utf8",timeout:180000});
  if(build.status!==0)throw Error("Build failed "+build.stderr);
  const originalHash=sha(source);
  const single=path.join(out,"ocr-origin.pdf"),folder=path.join(out,"ocr-directory");
  rmSync(folder,{recursive:true,force:true});
  rmSync(folder+"_md",{recursive:true,force:true});
  mkdirSync(folder,{recursive:true});
  copyFileSync(source,single);copyFileSync(source,path.join(folder,"origin.pdf"));
  for(let i=0;i<3;i++)rmSync(path.join(out,"ocr-origin"+(i?"-"+i:"")+".md"),{force:true});
  const singleMd=invoke("single",single);
  const folderMd=invoke("folder",folder);
  if(!existsSync(singleMd)||!existsSync(folderMd))throw Error("Missing OCR Markdown output");
  const a=readFileSync(singleMd,"utf8"),b=readFileSync(folderMd,"utf8");
  if(a!==b)throw Error("Folder and single PDF OCR Markdown differ");
  if(a.length<500 || !a.includes("Vision OCR") || !a.includes("AnyDoc"))
    throw Error("OCR output lacks expected mixed page markers");
  if(sha(source)!==originalHash)throw Error("Reference fixture was modified");
  const digest=sha(singleMd);
  const report=["","## Mixed PDF Vision OCR recovery (tests2/origin.pdf)","",
    "| Mode | Markdown SHA256 | Characters | Result |","|---|---|---:|---|",
    "| PDF | "+digest+" | "+a.length+" | PASS |",
    "| Directory | "+sha(folderMd)+" | "+b.length+" | PASS |",
    "","- Native PDFKit split + Vision OCR; both modes have identical output.",
    "- WASM singleton initialized once per execution; source fixture unchanged.",""];
  writeFileSync(path.join(root,"test_report.md"),report.join("\n"),{flag:"a"});
  console.log(report.join("\n"));
} catch(e){
  const msg=String(e);
  writeFileSync(path.join(root,"test_report.md"),"\n## Mixed PDF OCR recovery\n\n- FAIL: "+msg+"\n",{flag:"a"});
  console.error(msg);process.exitCode=1;
}
