import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {copyFileSync,existsSync,mkdirSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {extractBatchOutput} from "./test-utils";

const root=process.cwd(),out=path.join(root,"tests/output"),source=path.join(root,"tests/origin.pdf");
const mixedNames=["chunk_1.pdf","chunk_2.docx","chunk_3.pptx","chunk_4.xlsx","origin.pdf"];
function sha(file:string){return createHash("sha256").update(readFileSync(file)).digest("hex");}
function invoke(runtime:"Node"|"JXA",label:string,input:string,expected=1,requireOcr=false){
  const command=runtime==="Node"?"npx":"osascript";
  const args=runtime==="Node"?["--no-install","tsx","src/hosts/node.ts",input]:
    ["-l","JavaScript",path.join(root,"dist/anydoc-wasm.osascript.js"),input];
  const run=spawnSync(command,args,{cwd:root,encoding:"utf8",timeout:900000,maxBuffer:32*1024*1024});
  writeFileSync(path.join(out,"ocr-"+label+".log"),"runtime="+runtime+"\nexit="+run.status+"\n"+run.stdout+"\n"+run.stderr);
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
      throw Error(label+" "+runtime+" missing/incorrect structured OCR metadata: "+JSON.stringify(result));
  }
  return (result.conversions as Array<{output:string}>)[0].output;
}
function makeMixedFolder(folder:string){
  rmSync(folder,{recursive:true,force:true});mkdirSync(folder,{recursive:true});
  for(const name of mixedNames)copyFileSync(path.join(root,"tests",name),path.join(folder,name));
}
mkdirSync(out,{recursive:true});
const nodeFolder=path.join(os.tmpdir(),"anydoc-ocr-node-fixture-"+process.pid);
const jxaFolder=path.join(os.tmpdir(),"anydoc-ocr-jxa-fixture-"+process.pid);
const nodeFolderMd=nodeFolder+"_md",jxaFolderMd=jxaFolder+"_md";
const singleNode=path.join(out,"ocr-single-node.pdf"),singleJxa=path.join(out,"ocr-single-jxa.pdf");
try {
  if(!existsSync(source))throw Error("Missing tests/origin.pdf fixture");
  const build=spawnSync(process.execPath,["build.js"],{cwd:root,encoding:"utf8",timeout:180000});
  if(build.status!==0)throw Error("Build failed "+build.stderr);
  const originalHash=sha(source);

  // Single PDF: AnyDoc text pages + Vision scanned pages; Node and JXA must be byte-identical.
  copyFileSync(source,singleNode);copyFileSync(source,singleJxa);
  const nodeSingleMd=invoke("Node","single-node",singleNode,1,true);
  const jxaSingleMd=invoke("JXA","single-jxa",singleJxa,1,true);
  const singleNodeHash=sha(nodeSingleMd),singleJxaHash=sha(jxaSingleMd);
  if(singleNodeHash!==singleJxaHash)throw Error("Node/JXA single PDF OCR SHA256 mismatch: "+singleNodeHash+" vs "+singleJxaHash);
  const markdown=readFileSync(nodeSingleMd,"utf8");
  if(markdown.length<500||/<!--\s*(?:pages?|page)\s+\d+/i.test(markdown))
    throw Error("OCR Markdown is too short or contains internal chunk marker comments");

  // Isolated recursive fixtures live in the OS temp directory, never under tests/.
  // This prevents test logs/reports/generated PDFs from being rediscovered as inputs.
  makeMixedFolder(nodeFolder);makeMixedFolder(jxaFolder);
  invoke("Node","folder-node",nodeFolder,5,true);
  invoke("JXA","folder-jxa",jxaFolder,5,true);
  const names=["chunk_1.md","chunk_2.md","chunk_3.md","chunk_4.md","origin.md"];
  const rows:string[]=[];
  for(const name of names){
    const a=path.join(nodeFolderMd,name),b=path.join(jxaFolderMd,name);
    if(!existsSync(a)||!existsSync(b))throw Error("Recursive OCR output missing "+name+"; expected "+a+" and "+b);
    const ah=sha(a),bh=sha(b);
    if(ah!==bh)throw Error("Node/JXA recursive-folder SHA256 mismatch for "+name+": "+ah+" vs "+bh);
    rows.push("| "+name+" | "+ah+" | "+bh+" | PASS |");
  }
  const folderOriginHash=sha(path.join(nodeFolderMd,"origin.md"));
  if(folderOriginHash!==singleNodeHash)throw Error("Single PDF vs recursive-folder origin.pdf SHA256 mismatch");

  if(sha(source)!==originalHash)throw Error("Reference fixture was modified");
  const report=["","## Mixed PDF Vision OCR recovery (Node / JXA)","",
    "| Input mode / file | Node SHA256 | JXA SHA256 | Result |","|---|---|---|---|",
    "| Single PDF / origin.pdf | "+singleNodeHash+" | "+singleJxaHash+" | PASS |",
    "| Recursive folder / origin.pdf | "+folderOriginHash+" | "+sha(path.join(jxaFolderMd,"origin.md"))+" | PASS |",
    ...rows,
    "","- OCR request metadata is retained in the formatted JSON result as code/pages/pageCount.",
    "- Text-page PDF ranges use AnyDoc; scanned pages use macOS Vision OCR; Markdown is merged in original page order.",
    "- Internal chunk boundary comments are excluded from the exported Markdown.",
    "- Node delegates only native PDFKit/Vision recovery to an isolated JXA helper; Node and JXA each initialize their own AnyDoc WASM singleton once.",
    "- Recursive fixtures are isolated under the OS temporary directory; CI output/log folders are never scanned.",
    "- Source fixture unchanged.",""];
  writeFileSync(path.join(root,"test_report.md"),report.join("\n"),{flag:"a"});
  console.log(report.join("\n"));
} catch(error) {
  const message=String(error);
  writeFileSync(path.join(root,"test_report.md"),"\n## Mixed PDF Vision OCR recovery\n\n- FAIL: "+message+"\n",{flag:"a"});
  console.error(message);process.exitCode=1;
} finally {
  for(const folder of [nodeFolder,jxaFolder,nodeFolderMd,jxaFolderMd])rmSync(folder,{recursive:true,force:true});
}
