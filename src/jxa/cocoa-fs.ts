if (typeof ObjC !== 'undefined' && typeof ObjC.import === 'function') ObjC.import('Foundation');
export function toNsString(str:string):any{return $.NSString.stringWithString(String(str));}
export function toJsString(obj:any):string{if(!obj)return '';const val=ObjC.unwrap(obj);return val===null||val===undefined?'':String(val);}
export function nativeFileExists(path:string):boolean{return Boolean($.NSFileManager.defaultManager.fileExistsAtPath(toNsString(path)));}
/** Decode the bundled WASM with Foundation in JXA (once per batch). */
export function nativeDecodeWasmBase64(encoded:string):any {
  const data=$.NSData.alloc.initWithBase64EncodedStringOptions(toNsString(encoded),0);
  if(!data || Number(data.length)<8)throw new Error('Invalid embedded WASM');
  return data;
}
/** Native Foundation PDF read. Encoding is only the transport format to JSC. */
export function nativeReadBinaryAsBase64(path:string):string {
  const data=$.NSData.dataWithContentsOfFile(toNsString(path));
  if(!data || Number(data.length)===0)throw new Error('Cannot read PDF: '+path);
  return toJsString(data.base64EncodedStringWithOptions(0));
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
