if (typeof ObjC !== 'undefined' && typeof ObjC.import === 'function') ObjC.import('Foundation');
export function toNsString(str:string):any{return $.NSString.stringWithString(String(str));}
export function toJsString(obj:any):string{if(!obj)return '';const val=ObjC.unwrap(obj);return val===null||val===undefined?'':String(val);}
export function nativeFileExists(path:string):boolean{return Boolean($.NSFileManager.defaultManager.fileExistsAtPath(toNsString(path)));}
export function nativeReadBinaryAsBase64(path:string):string{
  // Foundation's base64EncodedStringWithOptions is not consistently exposed by JXA.
  // /usr/bin/base64 is a macOS system utility; its output is normalized to one line.
  const task=$.NSTask.alloc.init;
  task.setLaunchPath(toNsString('/usr/bin/base64'));
  const args=$.NSMutableArray.alloc.init;
  args.addObject(toNsString('-i'));args.addObject(toNsString(path));
  task.setArguments(args);
  const pipe=$.NSPipe.pipe;
  task.setStandardOutput(pipe);
  task.setStandardError(pipe);
  task.launch;
  const data=pipe.fileHandleForReading.readDataToEndOfFile;
  task.waitUntilExit;
  const value=toJsString($.NSString.alloc.initWithDataEncoding(data,4));
  if(task.terminationStatus!==0||!value.trim())throw new Error('PDF base64 encoding failed: '+path+' '+value.slice(-500));
  return value.replace(/\\s+/g,'');
}
export function nativeWriteTextFile(path:string,content:string):void{
  const ok=toNsString(content).writeToFileAtomicallyEncodingError(toNsString(path),true,4,Ref());
  if(!ok)throw new Error('Cannot write file: '+path);
}
export function nativeRemoveFile(path:string):void{
  const fm=$.NSFileManager.defaultManager;
  if(fm.fileExistsAtPath(toNsString(path)))fm.removeItemAtPathError(toNsString(path),Ref());
}
export function nativeJoinPath(dir:string,file:string):string{return toJsString(toNsString(dir).stringByAppendingPathComponent(toNsString(file)));}
export function nativeGetTmpDir():string{return toJsString($.NSTemporaryDirectory());}
export function nativeGetEnv(key:string):string{
  if(typeof ObjC==='undefined')return '';
  return toJsString($.NSProcessInfo.processInfo.environment.objectForKey(toNsString(key)));
}
export function nativeParseArgs():string[]{
  if(typeof ObjC==='undefined')return [];
  const raw=ObjC.unwrap($.NSProcessInfo.processInfo.arguments);
  const values:string[]=[];let sep=false;
  for(let i=0;i<raw.length;i++){const a=toJsString(raw[i]);if(sep&&a)values.push(a);else if(a==='--')sep=true;}
  if(!sep&&raw.length){const a=toJsString(raw[raw.length-1]);if(a)values.push(a);}
  return values;
}
