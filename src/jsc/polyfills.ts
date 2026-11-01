/**
 * 纯 JavaScript 环境补丁，仅运行于 JSC 内部，不依赖 Node/JXA
 */
export function generateJscPolyfills(): string {
  return `
    if (typeof globalThis === 'undefined') { var globalThis = this; }
    if (typeof window === 'undefined') { globalThis.window = globalThis; }
    if (typeof self === 'undefined') { globalThis.self = globalThis; }
    if (typeof navigator === 'undefined') { globalThis.navigator = { userAgent: 'JSC' }; }
    if (typeof document === 'undefined') { globalThis.document = { createElement: function() { return {}; } }; }
    if (typeof location === 'undefined') { globalThis.location = { href: 'http://localhost/' }; }
    if (typeof performance === 'undefined') { globalThis.performance = { now: function() { return Date.now(); } }; }

    if (typeof TextDecoder === 'undefined') {
      function TextDecoder(encoding) { this.encoding = encoding || 'utf-8'; }
      TextDecoder.prototype.decode = function(bytes) {
        if (!bytes || !bytes.length) return '';
        var str = '';
        for (var i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
        try { return decodeURIComponent(escape(str)); } catch(e) { return str; }
      };
      globalThis.TextDecoder = TextDecoder;
    }

    if (typeof TextEncoder === 'undefined') {
      function TextEncoder() {}
      TextEncoder.prototype.encode = function(str) {
        var utf8 = unescape(encodeURIComponent(str || ''));
        var result = new Uint8Array(utf8.length);
        for (var i = 0; i < utf8.length; i++) result[i] = utf8.charCodeAt(i);
        return result;
      };
      globalThis.TextEncoder = TextEncoder;
    }

    if (typeof crypto === 'undefined') {
      globalThis.crypto = { getRandomValues: function(arr) { for (var i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); return arr; } };
    }

    if (typeof atob === 'undefined') {
      var b64Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
      globalThis.atob = function(input) {
        var str = String(input).replace(/=+$/, '');
        var output = '';
        if (str.length % 4 === 1) throw new Error('Invalid base64 string');
        for (var bc = 0, bs, buffer, idx = 0; buffer = str.charAt(idx++);
          ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++) ?
            output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0
        ) { buffer = b64Chars.indexOf(buffer); }
        return output;
      };
    }

    function b64ToUint8Array(b64) {
      var binStr = atob(b64);
      var bytes = new Uint8Array(binStr.length);
      for (var i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
      return bytes;
    }
  `;
}