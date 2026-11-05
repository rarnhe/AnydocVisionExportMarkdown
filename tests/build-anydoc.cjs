#!/usr/bin/env node
"use strict";
/* Derive self-contained JXA and Node scripts from the actual npm package.
 * Generation happens in Node; the JXA test executes the real WASM without Node.
 */
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");
const root = path.resolve(__dirname, "..");
const pkg = path.dirname(require.resolve("@firecrawl/anydoc-wasm"));
const wasmPath = path.join(pkg, "anydoc_wasm_bg.wasm");
const gluePath = ["anydoc_wasm.js", "anydoc_wasm_bg.js"]
  .map(name => path.join(pkg, name)).find(fs.existsSync);
if (!gluePath) throw Error("Cannot find AnyDoc wasm-bindgen JS glue");
const pdfPath = path.join(root, "tests", "chunk_1.pdf");
const wasm = fs.readFileSync(wasmPath);
const pdf = fs.readFileSync(pdfPath);
if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-") throw Error("Fixture is not a PDF");
if (wasm.subarray(0, 4).toString("hex") !== "0061736d") throw Error("No wasm magic header");

const transformed = esbuild.transformSync(fs.readFileSync(gluePath, "utf8"), {
  loader: "js",
  target: "es2020",
  format: "iife",
  globalName: "WasmGlue",
}).code;

/* Minimal compatibility shims for the real JXA/Node WASM smoke test.
 * Deliberately do not polyfill WebAssembly or ObjC.
 */
const polyfills = String.raw`
if (typeof globalThis === 'undefined') { var globalThis = this; }
if (typeof window === 'undefined') { globalThis.window = globalThis; }
if (typeof self === 'undefined') { globalThis.self = globalThis; }
if (typeof navigator === 'undefined') { globalThis.navigator = {userAgent:'JXA AnyDoc test'}; }
if (typeof location === 'undefined') { globalThis.location = {href:'http://localhost/'}; }
if (typeof performance === 'undefined') { globalThis.performance = {now:function(){return Date.now();}}; }
if (typeof TextDecoder === 'undefined') {
  function TextDecoder(encoding) { this.encoding = encoding || 'utf-8'; }
  TextDecoder.prototype.decode = function(bytes) {
    if (!bytes || !bytes.length) return '';
    var str = '';
    for (var i=0; i<bytes.length; i++) str += String.fromCharCode(bytes[i]);
    try { return decodeURIComponent(escape(str)); } catch(e) { return str; }
  };
  globalThis.TextDecoder = TextDecoder;
}
if (typeof TextEncoder === 'undefined') {
  function TextEncoder() {}
  TextEncoder.prototype.encode = function(str) {
    var utf8 = unescape(encodeURIComponent(str || ''));
    var result = new Uint8Array(utf8.length);
    for (var i=0; i<utf8.length; i++) result[i] = utf8.charCodeAt(i);
    return result;
  };
  globalThis.TextEncoder = TextEncoder;
}
if (typeof crypto === 'undefined') {
  globalThis.crypto = {getRandomValues:function(a) {
    for (var i=0; i<a.length; i++) a[i] = Math.floor(Math.random()*256);
    return a;
  }};
}
`;
const kernel = fs.readFileSync(path.join(root, "tests", "anydoc-runtime.js"), "utf8");
const staticData = "var __ANYDOC_WASM_B64__=" + JSON.stringify(wasm.toString("base64")) +
  ";\nvar __ANYDOC_PDF_B64__=" + JSON.stringify(pdf.toString("base64")) + ";\n";
const out = path.join(root, "tests", "output");
fs.mkdirSync(out, {recursive: true});
for (const [name, trailer] of [
  ["jxa-direct.js", "\nfunction run(argv) { return anydocRuntime('JXA'); }\n"],
  ["node-control.js", "\nconsole.log(anydocRuntime('Node'));\n"],
]) {
  fs.writeFileSync(path.join(out, name),
    polyfills + "\n" + transformed + "\n" + staticData + "\n" + kernel + trailer,
    "utf8");
}
console.log(JSON.stringify({
  wasm: path.relative(root, wasmPath), wasmBytes: wasm.length,
  glue: path.relative(root, gluePath), glueBytes: transformed.length,
  pdf: path.relative(root, pdfPath), pdfBytes: pdf.length,
  scripts: ["jxa-direct.js","node-control.js"],
  policy: "No interprocess calls inside the JXA generated script",
}));
