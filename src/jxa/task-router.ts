import {nativeParseArgs,nativeFileExists,nativeReadBinaryAsBase64,nativeWriteTextFile,nativeRemoveFile,nativeJoinPath,nativeGetTmpDir,toNsString,toJsString,nativeDecodeWasmBase64} from './cocoa-fs';
import {buildJscKernelScript} from '../jsc/jsc-runner';

function listPdfs(folder:string):string[]{
  const fm=$.NSFileManager.defaultManager;
  const entries=ObjC.unwrap(fm.contentsOfDirectoryAtPathError(toNsString(folder),Ref()));
  if(!entries)throw new Error('Cannot enumerate PDF directory: '+folder);
  const result:string[]=[];
  for(let i=0;i<entries.length;i++){
    const name=toJsString(entries[i]);
    if(!name.toLowerCase().endsWith('.pdf'))continue;
    const path=nativeJoinPath(folder,name);
    const isDir=Ref();
    if(fm.fileExistsAtPathIsDirectory(toNsString(path),isDir)&&!isDir[0])result.push(path);
  }
  return result.sort();
}
export function runJxaMode():void {
  const folder=nativeParseArgs()[0];
  if(!folder||!nativeFileExists(folder))throw new Error('Provide an existing PDF directory');
  const files=listPdfs(folder);
  if(!files.length)throw new Error('No PDF files in directory');
  const wasm=globalThis.__STATIC_WASM_B64__||'';
  const glue=globalThis.__STATIC_GLUE_CODE__||'';
  if(!wasm||!glue)throw new Error('Missing embedded WASM or glue');
  // JXA owns Base64 decoding. The JSC process still needs a binary-safe
  // serialization of the decoded NSData to instantiate WebAssembly.
  const wasmData=nativeDecodeWasmBase64(wasm);
  const wasmTransport=toJsString(wasmData.base64EncodedStringWithOptions(0));
  const token=Date.now()+'_'+Math.random().toString(36).slice(2);
  const kernelPath=nativeJoinPath(nativeGetTmpDir(),'anydoc_worker_'+token+'.js');
  const logPath=nativeJoinPath(nativeGetTmpDir(),'anydoc_worker_'+token+'.log');
  nativeWriteTextFile(kernelPath,buildJscKernelScript(wasmTransport,glue,files.length));
  nativeWriteTextFile(logPath,'');
  const stdin=$.NSPipe.pipe;
  const stdout=$.NSFileHandle.fileHandleForWritingAtPath(toNsString(logPath));
  if(!stdout){nativeRemoveFile(kernelPath);nativeRemoveFile(logPath);throw new Error('Cannot open JSC output log');}
  const task=$.NSTask.alloc.init;
  try{
    task.setLaunchPath(toNsString('/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc'));
    const args=$.NSMutableArray.alloc.init;
    args.addObject(toNsString(kernelPath));
    task.setArguments(args);
    task.setStandardInput(stdin);
    task.setStandardOutput(stdout);
    task.setStandardError(stdout);
    task.launch;
    const writer=stdin.fileHandleForWriting;
    for(let i=0;i<files.length;i++){
      const encoded=nativeReadBinaryAsBase64(files[i]).replace(/\\s+/g,'');
      writer.writeData(toNsString(encoded+'\\n').dataUsingEncoding(4));
    }
    // JXA exposes Objective-C no-argument selectors as properties, not JS functions.
    writer.closeFile;
    task.waitUntilExit;
    stdout.closeFile;
    const log=$.NSString.stringWithContentsOfFileEncodingError(toNsString(logPath),4,Ref());
    const raw=toJsString(log);
    if(task.terminationStatus!==0)throw new Error('JSC exited '+task.terminationStatus+': '+raw.slice(-2000));
    if(raw.indexOf('BATCH_INIT_OK')<0)throw new Error('WASM failed to initialize: '+raw.slice(-2000));
    let successes=0;
    for(let i=0;i<files.length;i++){
      const prefix='BATCH_RESULT:'+i+':';
      const line=raw.split('\\n').find(x=>x.indexOf(prefix)===0);
      if(!line){console.log('BATCH_FAILED '+files[i]+' '+raw.slice(-1000));continue;}
      const md=decodeURIComponent(line.slice(prefix.length));
      if(!md.trim()){console.log('BATCH_FAILED empty Markdown: '+files[i]);continue;}
      nativeWriteTextFile(files[i].slice(0,-4)+'.md',md);
      successes++;
    }
    console.log('BATCH_SUMMARY '+successes+'/'+files.length+' WASM_INIT=1 JSC_PROCESS=1');
    if(successes!==files.length)throw new Error('Batch conversion incomplete: '+successes+'/'+files.length);
  }finally{
    try{stdin.fileHandleForWriting.closeFile;}catch(e){}
    try{stdout.closeFile;}catch(e){}
    nativeRemoveFile(kernelPath);
    nativeRemoveFile(logPath);
  }
}
