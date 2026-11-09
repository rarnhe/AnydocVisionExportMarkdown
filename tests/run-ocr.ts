import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {copyFileSync,existsSync,mkdirSync,readFileSync,renameSync,rmSync,writeFileSync} from "node:fs";
import path from "node:path";
import {extractBatchOutput} from "./test-utils";
const root=process.cwd(),out=path.join(root,"tests/output"),source=path.join(root,"tests/origin.pdf");
function sha(p:string){return createHash("sha256").update(readFileSync(p)).digest("hex");}
function invoke(label:string,input:string,expected=1,requireOcr=false){
  const run=spawnSync("osascript",["-l","JavaScript",path.join(root,"dist/anydoc-wasm.osascript.js"),input],
    {cwd:root,encoding:"utf8",timeout:900000,maxBuffer:16*1024*1024});
  writeFileSync(path.join(out,"ocr-"+label+".log"),
    "exit="+run.status+"\n"+run.stdout+"\n"+run.stderr);
  if(run.status!==0)throw Error(label+" osascript failed: "+run.stderr);
  const result=extractBatchOutput(String(run.stdout)+"\n"+String(run.stderr));
  if(result.failureCount||result.conversionCount!==expected||result.wasmInitializationCount!==1)
    throw Error(label+" bad result "+JSON.stringify(result));
  if(requireOcr){
    const recovered=(result.conversions as Array<{output:string;ocrRecovery?:{code:string;pages:number[];pageCount:number}}>)
      .find(item=>item.ocrRecovery);
    const expectedPages=[12,17,...Array.from({length:37},(_,i)=>i+20)];
    if(!recovered||recovered.ocrRecovery?.code!=="needsOcr"||recovered.ocrRecovery.pageCount!==56||
       JSON.stringify(recovered.ocrRecovery.pages)!==JSON.stringify(expectedPages))
      throw Error(label+" missing/incorrect structured OCR recovery metadata: "+JSON.stringify(result));
  }
  return (result.conversions as Array<{output:string}>)[0].output;
}
mkdirSync(out,{recursive:true});
try {
  if(!existsSync(source))throw Error("Missing tests/origin.pdf fixture");
  const build=spawnSync(process.execPath,["build.js"],{cwd:root,encoding:"utf8",timeout:180000});
  if(build.status!==0)throw Error("Build failed "+build.stderr);
  const originalHash=sha(source);
  const single=path.join(out,"ocr-origin.pdf"),folder=path.join(out,"ocr-directory");
  rmSync(folder,{recursive:true,force:true});
  rmSync(folder+"_md",{recursive:true,force:true});
  mkdirSync(folder,{recursive:true});
  copyFileSync(source,single);copyFileSync(source,path.join(folder,"origin.pdf"));
  for(const name of ["chunk_1.pdf","chunk_2.docx","chunk_3.pptx","chunk_4.xlsx"]){
    const src=path.join(root,"tests",name);
    if(!existsSync(src))throw Error("Missing mixed folder fixture: "+src);
    copyFileSync(src,path.join(folder,name));
  }
  for(let i=0;i<3;i++)rmSync(path.join(out,"ocr-origin"+(i?"-"+i:"")+".md"),{force:true});
  const singleMd=invoke("single",single,1,true);
  invoke("folder",folder,5,true);
  const folderMd=path.join(folder+"_md","origin.md");
  for(const name of ["chunk_1.md","chunk_2.md","chunk_3.md","chunk_4.md"]){
    const file=path.join(folder+"_md",name);
    if(!existsSync(file)||readFileSync(file).length<30)throw Error("Missing/short mixed folder Markdown: "+name);
  }
  if(!existsSync(singleMd)||!existsSync(folderMd))throw Error("Missing OCR Markdown output");
  const a=readFileSync(singleMd,"utf8"),b=readFileSync(folderMd,"utf8");
  if(a!==b)throw Error("Folder and single PDF OCR Markdown differ");
  if(a.length<500 || !a.includes("Vision OCR") || !a.includes("AnyDoc"))
    throw Error("OCR output lacks expected mixed page markers");
  if(sha(source)!==originalHash)throw Error("Reference fixture was modified");
  // Exercise tests/ itself as the recursive input, not just a copied fixture set.
  const directFolder=path.join(root,"tests");
  // Keep generated PDFs out of tests/ while it is used as the recursive fixture.
  const savedOutput=path.join(root,".tests-output-backup");
  rmSync(savedOutput,{recursive:true,force:true});
  if(existsSync(out))renameSync(out,savedOutput);
  mkdirSync(out,{recursive:true});
  let actualFolder:string|undefined;
  try {
    const before=new Set<string>();
    for(let n=1;n<=10;n++){
      const candidate=directFolder+"_md"+(n===1?"":" "+n);
      if(existsSync(candidate))before.add(candidate);
    }
    invoke("tests-directory",directFolder,5,true);
    for(let n=1;n<=11;n++){
      const candidate=directFolder+"_md"+(n===1?"":" "+n);
      if(!before.has(candidate)&&existsSync(candidate)){actualFolder=candidate;break;}
    }
    if(!actualFolder)throw Error("Direct tests/ folder output missing");
    for(const name of ["chunk_1.md","chunk_2.md","chunk_3.md","chunk_4.md","origin.md"]){
      const file=path.join(actualFolder,name);
      if(!existsSync(file))throw Error("Direct tests/ folder missing "+name);
      if(sha(file)!==sha(path.join(folder+"_md",name)))
        throw Error("Direct tests/ vs copied folder SHA256 mismatch: "+name);
    }
  } finally {
    if(actualFolder)rmSync(actualFolder,{recursive:true,force:true});
    rmSync(out,{recursive:true,force:true});
    if(existsSync(savedOutput))renameSync(savedOutput,out);
  }
  const digest=sha(singleMd);
  const report=["","## Mixed PDF Vision OCR recovery (tests/origin.pdf)","",
    "| Mode | Markdown SHA256 | Characters | Result |","|---|---|---:|---|",
    "| PDF | "+digest+" | "+a.length+" | PASS |",
    "| Directory (5 mixed files) | "+sha(folderMd)+" | "+b.length+" | PASS |",
    "| Direct tests/ recursive input | "+sha(folderMd)+" | "+b.length+" | PASS |",
    "","- Native PDFKit split + Vision OCR; both modes have identical output.",
    "- WASM singleton initialized once per execution; source fixture unchanged.",""];
  writeFileSync(path.join(root,"test_report.md"),report.join("\n"),{flag:"a"});
  console.log(report.join("\n"));
} catch(e){
  const msg=String(e);
  writeFileSync(path.join(root,"test_report.md"),"\n## Mixed PDF OCR recovery\n\n- FAIL: "+msg+"\n",{flag:"a"});
  console.error(msg);process.exitCode=1;
}
