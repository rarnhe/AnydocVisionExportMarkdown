import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {copyFileSync,existsSync,mkdirSync,readFileSync,renameSync,rmSync,writeFileSync} from "node:fs";
import path from "node:path";
import {extractBatchOutput} from "./test-utils";
const root=process.cwd(),out=path.join(root,"tests/output"),source=path.join(root,"tests/origin.pdf");
const mixedNames=["chunk_1.pdf","chunk_2.docx","chunk_3.pptx","chunk_4.xlsx","origin.pdf"];
function sha(p:string){return createHash("sha256").update(readFileSync(p)).digest("hex");}
function invoke(runtime:"Node"|"JXA",label:string,input:string,expected=1,requireOcr=false){
  const command=runtime==="Node"?"npx":"osascript";
  const args=runtime==="Node"?["--no-install","tsx","src/hosts/node.ts",input]:
    ["-l","JavaScript",path.join(root,"dist/anydoc-wasm.osascript.js"),input];
  const run=spawnSync(command,args,{cwd:root,encoding:"utf8",timeout:900000,maxBuffer:32*1024*1024});
  writeFileSync(path.join(out,"ocr-"+label+".log"),
    "runtime="+runtime+"\nexit="+run.status+"\n"+run.stdout+"\n"+run.stderr);
  if(run.error)throw run.error;
  if(run.status!==0)throw Error(label+" "+runtime+" failed: "+String(run.stderr).slice(-4000));
  const result=extractBatchOutput(String(run.stdout)+"\n"+String(run.stderr));
  if(result.failureCount||result.conversionCount!==expected||result.wasmInitializationCount!==1)
    throw Error(label+" "+runtime+" bad result "+JSON.stringify(result));
  if(requireOcr){
    const recovered=(result.conversions as Array<{output:string;ocrRecovery?:{code:string;pages:number[];pageCount:number}}>)
      .find(item=>item.ocrRecovery);
    const expectedPages=[12,17,...Array.from({length:37},(_,i)=>i+20)];
    if(!recovered||recovered.ocrRecovery?.code!=="needsOcr"||recovered.ocrRecovery.pageCount!==56||
       JSON.stringify(recovered.ocrRecovery.pages)!==JSON.stringify(expectedPages))
      throw Error(label+" "+runtime+" missing/incorrect structured OCR recovery metadata: "+JSON.stringify(result));
  }
  return (result.conversions as Array<{output:string}>)[0].output;
}
function makeMixedFolder(folder:string){
  rmSync(folder,{recursive:true,force:true});mkdirSync(folder,{recursive:true});
  for(const name of mixedNames)copyFileSync(path.join(root,"tests",name),path.join(folder,name));
}
mkdirSync(out,{recursive:true});
try {
  if(!existsSync(source))throw Error("Missing tests/origin.pdf fixture");
  const build=spawnSync(process.execPath,["build.js"],{cwd:root,encoding:"utf8",timeout:180000});
  if(build.status!==0)throw Error("Build failed "+build.stderr);
  const originalHash=sha(source);

  // Single-file PDF: Node and JXA must both recover the exact same mixed-content Markdown.
  const nodePdf=path.join(out,"ocr-node-origin.pdf"),jxaPdf=path.join(out,"ocr-jxa-origin.pdf");
  copyFileSync(source,nodePdf);copyFileSync(source,jxaPdf);
  const nodeSingleMd=invoke("Node","single-node",nodePdf,1,true);
  const jxaSingleMd=invoke("JXA","single-jxa",jxaPdf,1,true);
  if(sha(nodeSingleMd)!==sha(jxaSingleMd))throw Error("Node/JXA single PDF OCR SHA256 mismatch");
  const singleText=readFileSync(nodeSingleMd,"utf8");
  if(singleText.length<500||!singleText.includes("Vision OCR")||!singleText.includes("AnyDoc"))
    throw Error("OCR output lacks expected mixed page markers");

  // Recursive folder: both runtimes process the same five PDF/Office fixtures.
  const nodeFolder=path.join(out,"ocr-directory-node"),jxaFolder=path.join(out,"ocr-directory-jxa");
  makeMixedFolder(nodeFolder);makeMixedFolder(jxaFolder);
  invoke("Node","folder-node",nodeFolder,5,true);
  invoke("JXA","folder-jxa",jxaFolder,5,true);
  const nodeFolderMd=nodeFolder+"_md",jxaFolderMd=jxaFolder+"_md";
  for(const name of ["chunk_1.md","chunk_2.md","chunk_3.md","chunk_4.md","origin.md"]){
    const nodeFile=path.join(nodeFolderMd,name),jxaFile=path.join(jxaFolderMd,name);
    if(!existsSync(nodeFile)||!existsSync(jxaFile))throw Error("Missing mixed folder Markdown: "+name);
    if(sha(nodeFile)!==sha(jxaFile))throw Error("Node/JXA folder SHA256 mismatch: "+name);
  }
  if(sha(path.join(nodeFolderMd,"origin.md"))!==sha(nodeSingleMd))
    throw Error("Single PDF vs Node folder OCR SHA256 mismatch");

  // Use tests/ itself as the recursive fixture. Move generated PDFs/logs away so
  // discovery sees only the five intended samples, then restore test artifacts.
  const directFolder=path.join(root,"tests"),savedOutput=path.join(root,".tests-output-backup");
  rmSync(savedOutput,{recursive:true,force:true});
  if(existsSync(out))renameSync(out,savedOutput);
  mkdirSync(out,{recursive:true});
  let nodeDirect:string|undefined,jxaDirect:string|undefined;
  try {
    const before=new Set<string>();
    for(let n=1;n<=10;n++){
      const candidate=directFolder+"_md"+(n===1?"":" "+n);
      if(existsSync(candidate))before.add(candidate);
    }
    invoke("Node","tests-directory-node",directFolder,5,true);
    for(let n=1;n<=11;n++){
      const candidate=directFolder+"_md"+(n===1?"":" "+n);
      if(!before.has(candidate)&&existsSync(candidate)){nodeDirect=candidate;break;}
    }
    if(!nodeDirect)throw Error("Node direct tests/ folder output missing");
    invoke("JXA","tests-directory-jxa",directFolder,5,true);
    for(let n=1;n<=12;n++){
      const candidate=directFolder+"_md"+(n===1?"":" "+n);
      if(candidate!==nodeDirect&&!before.has(candidate)&&existsSync(candidate)){jxaDirect=candidate;break;}
    }
    if(!jxaDirect)throw Error("JXA direct tests/ folder output missing");
    for(const name of ["chunk_1.md","chunk_2.md","chunk_3.md","chunk_4.md","origin.md"]){
      const nodeFile=path.join(nodeDirect,name),jxaFile=path.join(jxaDirect,name);
      if(!existsSync(nodeFile)||!existsSync(jxaFile))throw Error("Direct tests/ output missing "+name);
      if(sha(nodeFile)!==sha(jxaFile)||sha(nodeFile)!==sha(path.join(nodeFolderMd,name)))
        throw Error("Direct tests/ Node/JXA/copied-folder SHA256 mismatch: "+name);
    }
  } finally {
    if(nodeDirect)rmSync(nodeDirect,{recursive:true,force:true});
    if(jxaDirect)rmSync(jxaDirect,{recursive:true,force:true});
    rmSync(out,{recursive:true,force:true});
    if(existsSync(savedOutput))renameSync(savedOutput,out);
  }
  if(sha(source)!==originalHash)throw Error("Reference fixture was modified");

  const digest=sha(nodeSingleMd);
  const report=["","## Mixed PDF Vision OCR recovery (Node / JXA)","",
    "| Input mode | Node SHA256 | JXA SHA256 | Result |","|---|---|---|---|",
    "| Single PDF | "+digest+" | "+sha(jxaSingleMd)+" | PASS |",
    "| Recursive folder / origin.pdf | "+sha(path.join(nodeFolderMd,"origin.md"))+" | "+sha(path.join(jxaFolderMd,"origin.md"))+" | PASS |",
    "| Direct tests/ recursive folder / origin.pdf | "+sha(path.join(nodeDirect!,"origin.md"))+" | "+sha(path.join(jxaDirect!,"origin.md"))+" | PASS |",
    "| All five files in recursive folders | matching per-file hashes | matching per-file hashes | PASS |",
    "","- Node delegates only native PDFKit/Vision work to an isolated JXA helper; Node and JXA each initialize their own AnyDoc WASM singleton once.",
    "- OCR metadata is retained in ANYDOC_BATCH_JSON as code/pages/pageCount.",
    "- Text-page PDF chunks use AnyDoc; scanned pages use Vision OCR; Markdown is merged in original page order.",
    "- Source fixture unchanged.",""];
  writeFileSync(path.join(root,"test_report.md"),report.join("\n"),{flag:"a"});
  console.log(report.join("\n"));
} catch(e){
  const msg=String(e);
  writeFileSync(path.join(root,"test_report.md"),"\n## Mixed PDF OCR recovery\n\n- FAIL: "+msg+"\n",{flag:"a"});
  console.error(msg);process.exitCode=1;
}
