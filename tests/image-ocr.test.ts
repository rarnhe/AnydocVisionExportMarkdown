import assert from "node:assert/strict";
import {test} from "node:test";
import {spawnSync} from "node:child_process";
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {planConversions} from "../src/core/processor";
import {createNodeFilePort} from "../src/adapters/node-fs";
import {extractBatchOutput} from "./test-utils";

test("PNG/JPG/JPEG are discovered and keep the normal .md output naming",()=>{
  const root=mkdtempSync(path.join(os.tmpdir(),"anydoc-image-plan-"));
  try {
    for(const name of ["photo.png","scan.jpg","scan.jpeg"])copyFileSync("tests/chunk_6.png",path.join(root,name));
    const tasks=planConversions([root],createNodeFilePort());
    assert.deepEqual(tasks.map(t=>path.basename(t.output)),["photo.md","scan.md","scan-1.md"]);
    assert.equal(planConversions([path.join(root,"photo.png")],createNodeFilePort())[0].output,path.join(root,"photo.md"));
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("real PNG Vision OCR is consistent in Node and JXA; empty OCR skips the file",()=>{
  if(process.platform!=="darwin")return;
  const root=mkdtempSync(path.join(os.tmpdir(),"anydoc-image-ocr-"));
  try{
    const bundle=path.resolve("dist/anydoc-wasm.osascript.js");
    assert.ok(existsSync(bundle),"Build JXA bundle before image OCR integration test");
    const outputs:string[]=[];
    const statuses:string[]=[];
    for(const runtime of ["Node","JXA"] as const){
      const image=path.join(root,runtime+".png");
      copyFileSync("tests/chunk_6.png",image);
      const run=runtime==="Node"
        ?spawnSync("npx",["--no-install","tsx","src/hosts/node.ts",image],{encoding:"utf8",timeout:120000})
        :spawnSync("osascript",["-l","JavaScript",bundle,image],{encoding:"utf8",timeout:120000});
      assert.equal(run.status,0,runtime+": "+run.stderr+"\n"+run.stdout);
      const batch=extractBatchOutput(String(run.stdout)+"\n"+String(run.stderr));
      assert.equal(batch.failureCount,0);
      assert.equal(batch.discoveredCount,1);
      assert.equal(batch.conversionCount+Number(batch.skippedCount),1);
      const md=path.join(root,runtime+".md");
      if(batch.skippedCount===1){
        assert.ok(!existsSync(md),"Empty Vision OCR must not create Markdown");
        statuses.push("skipped");outputs.push("");
      }else{
        assert.ok(existsSync(md),"Vision OCR must create Markdown when text exists");
        statuses.push("converted");outputs.push(readFileSync(md,"utf8"));
      }
    }
    assert.equal(statuses[0],statuses[1],"Node/JXA outcomes must match");
    assert.equal(outputs[0],outputs[1],"Node/JXA OCR Markdown must be identical");
  }finally{rmSync(root,{recursive:true,force:true});}
});


test("single-file mode skips hidden and Office temporary documents",()=>{
  const root=mkdtempSync(path.join(os.tmpdir(),"anydoc-hidden-single-"));
  try {
    for(const name of [".~draft.docx",".hidden.docx","~$draft.docx","normal.docx"]){
      const file=path.join(root,name);
      writeFileSync(file,"fixture");
      const tasks=planConversions([file],createNodeFilePort());
      assert.equal(tasks.length,name==="normal.docx"?1:0,name);
    }
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("recursive directory mode ignores hidden files, hidden folders and Office locks",()=>{
  const root=mkdtempSync(path.join(os.tmpdir(),"anydoc-hidden-tree-"));
  try {
    const hidden=path.join(root,".hidden-dir");
    const nested=path.join(root,"nested");
    mkdirSync(hidden);mkdirSync(nested);
    for(const name of [".~draft.docx",".hidden.docx","~$draft.docx","normal.docx"])
      writeFileSync(path.join(root,name),"fixture");
    writeFileSync(path.join(hidden,"should-not-process.pdf"),"fixture");
    writeFileSync(path.join(nested,"kept.pdf"),"fixture");
    writeFileSync(path.join(nested,".~skip.png"),"fixture");
    const tasks=planConversions([root],createNodeFilePort());
    assert.deepEqual(tasks.map(task=>path.relative(root,task.input)),["nested/kept.pdf","normal.docx"]);
  }finally{rmSync(root,{recursive:true,force:true});rmSync(root+"_md",{recursive:true,force:true});}
});
