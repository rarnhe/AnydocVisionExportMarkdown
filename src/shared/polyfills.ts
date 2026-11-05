/** Host shims from the successful real-AnyDoc JXA probe.
 * Do not polyfill WebAssembly itself: actual native WASM support is required.
 */
export function installAnyDocPolyfills(): void {
  const host = globalThis as any;
  if (typeof host.window === "undefined") host.window = host;
  if (typeof host.self === "undefined") host.self = host;
  if (typeof host.navigator === "undefined") host.navigator = { userAgent: "JXA-AnyDoc" };
  if (typeof host.document === "undefined") host.document = { createElement: () => ({}) };
  if (typeof host.location === "undefined") host.location = { href: "http://localhost/" };
  if (typeof host.performance === "undefined") host.performance = { now: () => Date.now() };

  if (typeof host.TextDecoder === "undefined") {
    host.TextDecoder = class {
      constructor(_encoding?: string) {}
      decode(bytes: Uint8Array): string {
        if (!bytes || bytes.length === 0) return "";
        let raw = "";
        for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
        try { return decodeURIComponent(escape(raw)); }
        catch (_e) { return raw; }
      }
    };
  }
  if (typeof host.TextEncoder === "undefined") {
    host.TextEncoder = class {
      encode(text: string): Uint8Array {
        const encoded = unescape(encodeURIComponent(text || ""));
        const result = new Uint8Array(encoded.length);
        for (let i = 0; i < encoded.length; i++) result[i] = encoded.charCodeAt(i);
        return result;
      }
    };
  }
  if (typeof host.crypto === "undefined") {
    // Matches the reference prototype's non-cryptographic shim, only for wasm-bindgen compatibility.
    host.crypto = { getRandomValues: (array: Uint8Array): Uint8Array => {
      for (let i = 0; i < array.length; i++) array[i] = Math.floor(Math.random() * 256);
      return array;
    }};
  }
}
