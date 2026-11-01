// src/polyfills.ts

// 1. 全局 _Global 挂载（添加类型断言）
const _Global: typeof globalThis & Record<string, any> = 
  (typeof globalThis !== 'undefined' 
    ? globalThis 
    : typeof window !== 'undefined' 
    ? window 
    : typeof global !== 'undefined' 
    ? global 
    : this || {}) as any;

// // 1. 全局 _Global 挂载
// const _Global = typeof globalThis !== 'undefined' 
//   ? globalThis 
//   : typeof window !== 'undefined' 
//   ? window 
//   : typeof global !== 'undefined' 
//   ? global 
//   : this || {};

// 2. TextDecoder Polyfill (使用 NSString 转译，防范变量提升)
if (typeof _Global.TextDecoder === 'undefined') {
  (_Global as any).TextDecoder = class TextDecoder {
    encoding = 'utf-8';
    decode(input?: any): string {
      if (!input) return '';
      const bytes = input instanceof Uint8Array ? input : new Uint8Array(input.buffer || input);
      if (typeof ObjC !== 'undefined' && typeof $ !== 'undefined' && $.NSString) {
        const nsData = $.NSData.dataWithBytesLength(bytes, bytes.length);
        const nsStr = $.NSString.alloc.initWithDataEncoding(nsData, $.NSUTF8StringEncoding);
        if (nsStr && nsStr != $.nil) return String(nsStr.js);
      }
      return String.fromCharCode.apply(null, Array.from(bytes));
    }
  };
}

// 3. TextEncoder Polyfill
if (typeof _Global.TextEncoder === 'undefined') {
  (_Global as any).TextEncoder = class TextEncoder {
    encoding = 'utf-8';
    encode(input: string = ''): Uint8Array {
      if (!input) return new Uint8Array(0);
      if (typeof ObjC !== 'undefined' && typeof $ !== 'undefined' && $.NSString) {
        const nsStr = $.NSString.stringWithString(input);
        const data = nsStr.dataUsingEncoding($.NSUTF8StringEncoding);
        const buf = new Uint8Array(Number(data.length));
        data.getBytesLength(buf, buf.length);
        return buf;
      }
      const buf = new Uint8Array(input.length);
      for (let i = 0; i < input.length; i++) buf[i] = input.charCodeAt(i);
      return buf;
    }
  };
}

// 4. process Polyfill
if (typeof _Global.process === 'undefined') {
  (_Global as any).process = {
    argv: ['osascript', 'index.jxa.js'],
    env: {},
    exit: (code: number) => {
      if (typeof $ !== 'undefined' && $.exit) $.exit(code);
    },
  };
}