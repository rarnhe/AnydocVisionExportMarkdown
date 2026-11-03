import {nativeParseArgs,nativeFileExists,nativeReadBinaryAsBase64,nativeWriteTextFile,nativeRemoveFile,nativeJoinPath,nativeGetTmpDir,toNsString,toJsString} from './cocoa-fs';
import {buildJscKernelScript} from '../jsc/jsc-runner';

function pdfPaths(folder:string):string[]{
  const fm=$.NSFileManager.defaultManager;
  const entries=ObjC.unwrap(fm.contentsOfDirectoryAtPathError(toNsString(folder),null));
  const result:string[]=[];
  for(let i=0;i<entries.length;i++){
    const name=toJsString(entries[i]);
    if(!name.toLowerCase().endsWith('.pdf') || name.toLowerCase()==='test.pdf')continue;
    const file=nativeJoinPath(folder,name);
    const isDir=Ref();
    if(fm.fileExistsAtPathIsDirectory(toNsString(file),isDir) && !isDir[0])result.push(file);
  }
  return result.sort();
}
export function runJxaMode():void {
  const folder=nativeParseArgs()[0];
  if(!folder || !nativeFileExists(folder))throw new Error('Please provide an existing PDF directory');
  const files=pdfPaths(folder);
  if(!files.length)throw new Error('No PDF files found (test.pdf is excluded)');
  const wasmB64=globalThis.__STATIC_WASM_B64__ || ''; // Embedded at build time; no external WASM file needed
  if(!wasmB64)throw new Error('Embedded WASM payload missing from JXA bundle');
  const glue=globalThis.__STATIC_GLUE_CODE__ || '';
  if(!glue)throw new Error('WASM glue missing');
  const inputs=files.map(path=>({path,pdfB64:nativeReadBinaryAsBase64(path)}));
  const kernel=buildJscKernelScript(wasmB64,glue,inputs);
  const temp=nativeJoinPath(nativeGetTmpDir(),'anydoc_batch_'+Date.now()+'.js');
  nativeWriteTextFile(temp,kernel);
  let raw='';
  try{
    const task=$.NSTask.alloc.init;
    task.setLaunchPath(toNsString('/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc'));
    const args=$.NSMutableArray.alloc.init;
    args.addObject(toNsString(temp));
    task.setArguments(args);
    const pipe=$.NSPipe.pipe;
    task.setStandardOutput(pipe);
    task.setStandardError(pipe);
    task.launch;
    const data=pipe.fileHandleForReading.readDataToEndOfFile;
    task.waitUntilExit;
    raw=toJsString($.NSString.alloc.initWithDataEncoding(data,4));
    if(task.terminationStatus!==0)throw new Error('JSC exit '+task.terminationStatus+': '+raw);
  }finally{nativeRemoveFile(temp);}
  if(raw.indexOf('BATCH_INIT_OK')<0)throw new Error('WASM initialization failed: '+raw.slice(0,1000));
  let succeeded=0;
  for(let i=0;i<files.length;i++){
    const prefix='BATCH_RESULT:'+i+':';
    const line=raw.split('\n').find(s=>s.indexOf(prefix)===0);
    if(!line){console.log('FAILED '+files[i]+': '+raw.slice(-500));continue;}
    const md=decodeURIComponent(line.slice(prefix.length));
    if(!md.trim()){console.log('FAILED empty Markdown '+files[i]);continue;}
    nativeWriteTextFile(files[i].slice(0,-4)+'.md',md);
    succeeded++;
  }
  console.log('BATCH_SUMMARY: '+succeeded+'/'+files.length+' (one WASM initialization)');
  if(succeeded!==files.length)throw new Error('Batch conversion incomplete');
}
