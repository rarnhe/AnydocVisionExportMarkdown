import {nativeParseArgs,nativeFileExists,nativeReadBinaryAsBase64,nativeWriteTextFile,nativeRemoveFile,nativeJoinPath,nativeGetTmpDir,toNsString,toJsString} from './cocoa-fs';
import {buildJscKernelScript} from '../jsc/jsc-runner';

function pdfPaths(folder:string):string[]{
  const fm=$.NSFileManager.defaultManager;
  const entries=ObjC.unwrap(fm.contentsOfDirectoryAtPathError(toNsString(folder),null));
  const result:string[]=[];
  for(let i=0;i<entries.length;i++){
    const name=toJsString(entries[i]);
    if(!name.toLowerCase().endsWith('.pdf'))continue;
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
  if(!files.length)throw new Error('No PDF files found');

  const wasmB64=globalThis.__STATIC_WASM_B64__ || '';
  if(!wasmB64)throw new Error('Embedded WASM payload missing from JXA bundle');
  const glue=globalThis.__STATIC_GLUE_CODE__ || '';
  if(!glue)throw new Error('WASM glue missing');

  const tmp=nativeGetTmpDir();
  const token=Date.now()+'_'+Math.random().toString(36).slice(2);
  const kernelPath=nativeJoinPath(tmp,'anydoc_batch_'+token+'.js');
  const outputPath=nativeJoinPath(tmp,'anydoc_batch_'+token+'.out');
  const kernel=buildJscKernelScript(wasmB64,glue,files.length);
  nativeWriteTextFile(kernelPath,kernel);

  // Create the output file through the existing Foundation text helper.
  // Passing JavaScript null as NSDictionary attributes can bridge to NSNull,
  // which triggers '-[NSNull count]' inside NSFileManager on some macOS releases.
  nativeWriteTextFile(outputPath,'');
  const inputPipe=$.NSPipe.pipe;
  const outputHandle=$.NSFileHandle.fileHandleForWritingAtPath(toNsString(outputPath));
  if(!outputHandle) {
    nativeRemoveFile(kernelPath);
    throw new Error('Cannot create JSC output file: '+outputPath);
  }

  let raw='';
  let task:any=null;
  try {
    task=$.NSTask.alloc.init;
    task.setLaunchPath(toNsString('/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc'));
    const args=$.NSMutableArray.alloc.init;
    args.addObject(toNsString(kernelPath));
    task.setArguments(args);
    task.setStandardInput(inputPipe);
    task.setStandardOutput(outputHandle);
    task.setStandardError(outputHandle);
    task.launch;

    const writer=inputPipe.fileHandleForWriting;
    for(let i=0;i<files.length;i++){
      // WASM has no filesystem API: pass only the current file's bytes.
      // Do not build a batch-sized Base64 array or embed PDF payloads in JS.
      const pdfB64=nativeReadBinaryAsBase64(files[i]);
      const line=toNsString(pdfB64+'\n').dataUsingEncoding(4);
      writer.writeData(line);
    }
    writer.closeFile();
    task.waitUntilExit;
    outputHandle.closeFile();

    const readError=Ref();
    const outputString=$.NSString.alloc.initWithContentsOfFileEncodingError(toNsString(outputPath),4,readError);
    if(!outputString) throw new Error('Cannot read JSC output file: '+toJsString(readError[0]));
    raw=toJsString(outputString);
    if(task.terminationStatus!==0)throw new Error('JSC exit '+task.terminationStatus+': '+raw);
  } finally {
    try { inputPipe.fileHandleForWriting.closeFile(); } catch(e) {}
    try { outputHandle.closeFile(); } catch(e) {}
    nativeRemoveFile(kernelPath);
    nativeRemoveFile(outputPath);
  }

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
  console.log('BATCH_SUMMARY: '+succeeded+'/'+files.length+' (one WASM initialization; streamed PDF input)');
  if(succeeded!==files.length)throw new Error('Batch conversion incomplete');
}
