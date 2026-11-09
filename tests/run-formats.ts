import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {copyFileSync,existsSync,mkdirSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import path from "node:path";
import {extractBatchOutput,validateMarkdownBytes} from "./test-utils";
const root=process.cwd(),out=path.join(root,"tests/output"),fixture=path.join(root,"tests");
const formats=["pdf","docx","pptx","xlsx"] as const;
function digest(file:string):string {const bytes=readFileSync(file);validateMarkdownBytes(bytes);return createHash("sha256").update(bytes).digest("hex");}
function invoke(runtime:"Node"|"JXA",label:string,input:string,expected:number){
 const command=runtime==="Node"?"npx":"osascript";
 const args=runtime==="Node"?["--no-install","tsx","src/hosts/node.ts",input]:
   ["-l","JavaScript","dist/anydoc-wasm.osascript.js",input];
 const result=spawnSync(command,args,{cwd:root,encoding:"utf8",timeout:900000,maxBuffer:16*1024*1024});
 writeFileSync(path.join(out,"formats-"+label+".log"),"exit="+result.status+"\n"+result.stdout+"\n"+result.stderr);
 if(result.status!==0)throw Error(label+" exit="+result.status+" "+result.stderr.slice(-900));
 const parsed=extractBatchOutput(String(result.stdout)+"\n"+String(result.stderr));
 if(parsed.failureCount!==0||parsed.conversionCount!==expected||parsed.wasmInitializationCount!==1)
   throw Error(label+" unexpected result "+JSON.stringify(parsed));
 return parsed;
}
mkdirSync(out,{recursive:true});
try{
 const build=spawnSync(process.execPath,["build.js"],{cwd:root,encoding:"utf8",timeout:180000});
 if(build.status!==0)throw Error("build failed: "+build.stderr);
 for(const ext of formats)if(!existsSync(path.join(fixture,"chunk_1."+ext)))
   throw Error("Missing Office/PDF fixture "+ext);
 const report=["","## Document format SHA256 parity (Node / JXA)","",
   "| Source format | Node SHA256 | JXA SHA256 | Result |","|---|---|---|---|"];
 for(const ext of formats){
   const name="format-"+ext,dir=path.join(out,name);
   rmSync(dir,{recursive:true,force:true});mkdirSync(dir,{recursive:true});
   const input=path.join(dir,"input."+ext);
   copyFileSync(path.join(fixture,"chunk_1."+ext),input);
   invoke("Node",name+"-node",input,1);
   const nodeMd=path.join(dir,ext==="pdf"?"input.md":"input."+ext+".md");
   const a=digest(nodeMd);rmSync(nodeMd,{force:true});
   invoke("JXA",name+"-jxa",input,1);
   const b=digest(nodeMd);
   if(a!==b)throw Error("Node/JXA SHA256 mismatch for "+ext+": "+a+" vs "+b);
   report.push("| "+ext+" | "+a+" | "+b+" | PASS |");
 }
 // Folder mode: same four files in one directory, no output name collision.
 const folder=path.join(out,"formats-folder");
 for(const d of [folder,folder+"_md",folder+"_md 2"])rmSync(d,{recursive:true,force:true});
 mkdirSync(folder,{recursive:true});
 for(const ext of formats)copyFileSync(path.join(fixture,"chunk_1."+ext),path.join(folder,"chunk_1."+ext));
 invoke("Node","folder-node",folder,4);
 invoke("JXA","folder-jxa",folder,4);
 for(const ext of formats){
   const relative=ext==="pdf"?"chunk_1.md":"chunk_1."+ext+".md";
   const a=digest(path.join(folder+"_md",relative));
   const b=digest(path.join(folder+"_md 2",relative));
   if(a!==b)throw Error("Folder Node/JXA SHA256 mismatch "+ext);
   report.push("| folder/"+ext+" | "+a+" | "+b+" | PASS |");
 }
 writeFileSync(path.join(root,"test_report.md"),report.join("\n")+"\n",{flag:"a"});
 console.log(report.join("\n"));
}catch(e){
 const msg=String(e);writeFileSync(path.join(root,"test_report.md"),"\n## Document format parity\n\n- FAIL: "+msg+"\n",{flag:"a"});
 console.error(msg);process.exitCode=1;
}
