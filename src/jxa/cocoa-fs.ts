if (typeof ObjC !== 'undefined' && typeof ObjC.import === 'function') {
  ObjC.import('Foundation');
}

export function toNsString(str: string): any {
  if (str === null || str === undefined) return $.NSString.string;
  return $.NSString.stringWithString(String(str));
}

export function toJsString(obj: any): string {
  if (!obj) return '';
  const unwrapped = ObjC.unwrap(obj);
  return unwrapped ? String(unwrapped) : '';
}

export function nativeFileExists(pathStr: string): boolean {
  if (!pathStr) return false;
  const fm = $.NSFileManager.defaultManager;
  return fm.fileExistsAtPath(toNsString(pathStr));
}

export function nativeReadBinaryAsBase64(pathStr: string): string {
  const nsPath = toNsString(pathStr);
  const data = $.NSData.dataWithContentsOfFile(nsPath);
  if (!data || data.length === 0) {
    throw new Error(`无法读取文件或文件为空: ${pathStr}`);
  }
  return ObjC.unwrap(data.base64EncodedStringWithOptions(0));
}

export function nativeWriteTextFile(pathStr: string, content: string): void {
  const nsStr = toNsString(content);
  const nsPath = toNsString(pathStr);
  const success = nsStr.writeToFileAtomicallyEncodingError(
    nsPath, true, 4 /* NSUTF8StringEncoding */, null
  );
  if (!success) {
    throw new Error(`写入文件失败: ${pathStr}`);
  }
}

export function nativeRemoveFile(pathStr: string): void {
  const fm = $.NSFileManager.defaultManager;
  const nsPath = toNsString(pathStr);
  if (fm.fileExistsAtPath(nsPath)) {
    fm.removeItemAtPathError(nsPath, null);
  }
}

export function nativeJoinPath(dir: string, file: string): string {
  const nsDir = toNsString(dir);
  return toJsString(nsDir.stringByAppendingPathComponent(toNsString(file)));
}

export function nativeGetTmpDir(): string {
  return toJsString($.NSTemporaryDirectory());
}

export function nativeGetEnv(key: string): string {
  if (typeof ObjC === 'undefined') return '';
  const envDict = $.NSProcessInfo.processInfo.environment;
  const nsVal = envDict.objectForKey(toNsString(key));
  return toJsString(nsVal);
}

export function nativeParseArgs(): string[] {
  if (typeof ObjC === 'undefined') return [];
  const processInfo = $.NSProcessInfo.processInfo;
  const rawArgs = ObjC.unwrap(processInfo.arguments);
  const userArgs: string[] = [];
  let separatorFound = false;
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = toJsString(rawArgs[i]);
    if (separatorFound) {
      if (arg) userArgs.push(arg);
    } else if (arg === '--') {
      separatorFound = true;
    }
  }
  if (!separatorFound && rawArgs.length > 0) {
    for (let i = rawArgs.length - 1; i >= 0; i--) {
      const arg = toJsString(rawArgs[i]);
      if (arg && !arg.startsWith('-') && arg !== 'JavaScript') {
        userArgs.push(arg);
        break;
      }
    }
  }
  return userArgs;
}