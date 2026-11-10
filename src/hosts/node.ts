import {spawnSync} from "node:child_process";
import {copyFileSync,existsSync,mkdtempSync,readFileSync,rmSync} from "node:fs";
import os from "node:os";
import path from "node:path";
import {processInputs} from "../core/processor";
import {loadPackageAssets} from "./node-assets";
import {createNodeFilePort} from "../adapters/node-fs";
import type {OcrRequest} from "../core/needs-ocr";

/**
 * Node has no Cocoa/Vision APIs. Delegate only the native PDFKit/Vision recovery
 * to the already-built JXA host; Node keeps its own single AnyDoc WASM instance.
 * The helper runs in a separate JXA process and returns its Markdown via a temp file.
 */
function recoverWithJxaBridge(input:string,request:OcrRequest):string {
  const bundle=path.resolve(process.cwd(),"dist/anydoc-wasm.osascript.js");
  if(!existsSync(bundle))throw new Error("Mixed-PDF OCR in Node requires the JXA bundle; run npm run build first");
  const temp=mkdtempSync(path.join(os.tmpdir(),"anydoc-node-ocr-"));
  try {
    const pdf=path.join(temp,"input.pdf");
    copyFileSync(input,pdf);
    const run=spawnSync("osascript",["-l","JavaScript",bundle,pdf],{
      encoding:"utf8",timeout:900000,maxBuffer:32*1024*1024
    });
    if(run.error)throw run.error;
    const output=String(run.stdout||"")+"\n"+String(run.stderr||"");
    if(run.status!==0)throw new Error("JXA Vision recovery failed: "+output.slice(-4000));
    // JXA returns a pretty-printed JSON object, without a protocol prefix.
    // Its stdout/stderr may contain other host diagnostics; locate the first
    // complete JSON object rather than assuming a single-line marker.
    const firstBrace=output.indexOf("{");
    if(firstBrace<0)throw new Error("JXA Vision recovery returned no JSON: "+output.slice(-2000));
    let depth=0, quoted=false, escaped=false, jsonEnd=-1;
    for(let i=firstBrace;i<output.length;i++){
      const c=output[i];
      if(quoted){
        if(escaped)escaped=false;
        else if(c==="\\")escaped=true;
        else if(c==='"')quoted=false;
      }else if(c==='"')quoted=true;
      else if(c==="{")depth++;
      else if(c==="}" && --depth===0){jsonEnd=i+1;break;}
    }
    if(jsonEnd<0)throw new Error("JXA Vision recovery returned incomplete JSON: "+output.slice(-2000));
    const result=JSON.parse(output.slice(firstBrace,jsonEnd)) as {
      failureCount:number;conversionCount:number;skippedCount:number;
      conversions:Array<{output:string;ocrRecovery?:{code:string;pages:number[];pageCount:number}}>;
      skipped:Array<{input:string;output:string}>;
    };
    if(result.failureCount!==0)
      throw new Error("JXA recovery failed: "+JSON.stringify(result));
    // An all-image/blank document is a successful recovery with no Markdown
    // artifact. Preserve that outcome for the Node processor.
    if(result.conversionCount===0 && result.skippedCount===1 &&
       result.skipped?.[0]?.input===pdf)
      return "";
    const conversion=result.conversions?.[0];
    if(result.conversionCount!==1 || result.skippedCount!==0 || !conversion?.ocrRecovery ||
       conversion.ocrRecovery.code!=="needsOcr" || conversion.ocrRecovery.pageCount!==request.pageCount ||
       JSON.stringify(conversion.ocrRecovery.pages)!==JSON.stringify(request.pages))
      throw new Error("JXA recovery metadata mismatch: "+JSON.stringify(result));
    const outputPath=path.resolve(conversion.output);
    if(!outputPath.startsWith(temp+path.sep)||!existsSync(outputPath))
      throw new Error("JXA recovery Markdown path is missing or outside its temporary directory");
    return readFileSync(outputPath,"utf8");
  } finally {
    rmSync(temp,{recursive:true,force:true});
  }
}

try {
  const args=process.argv.slice(2);
  const result=processInputs(args,createNodeFilePort(),loadPackageAssets(),"Node",
    (input,request)=>recoverWithJxaBridge(input,request));
  console.log(JSON.stringify(result, null, 2));
  if(result.failureCount)process.exitCode=1;
} catch(error) {
  console.error("Node AnyDoc conversion failed:",error);
  process.exitCode=1;
}
