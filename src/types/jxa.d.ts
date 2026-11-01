declare const ObjC: {
  import: (framework: string) => void;
  unwrap: (obj: any) => any;
};

declare const $: {
  NSProcessInfo: any;
  NSFileManager: any;
  NSString: any;
  NSData: any;
  NSPipe: any;
  NSTask: any;
  NSURL: any;
  NSTemporaryDirectory: any;
  NSMutableArray: any;
  NSDictionary: any;
};

declare function print(message: string): void;
declare function Application(name: string): any;
declare const Path: (path: string) => any;