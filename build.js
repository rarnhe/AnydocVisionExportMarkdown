#!/usr/bin/env node
"use strict";
/*
 * Two standalone macOS JXA deliverables, sharing one TypeScript/WASM engine:
 * - osascript: CLI run(argv), executable shebang
 * - Automator: Run JavaScript run(input, parameters), paste the entire file
 * Build-time Node/esbuild only; no runtime Node, JSC or subprocess.
 */
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");
const root = __dirname;
require("tsx/cjs");
const {wasmBytes, glueCode} = require("./src/hosts/node-assets.ts").loadPackageAssets();
const outDir = path.join(root, "dist");
fs.mkdirSync(outDir, {recursive: true});
const common = {
  entryPoints: [path.join(root, "src", "hosts", "jxa.ts")],
  bundle: true,
  platform: "neutral",
  format: "iife",
  globalName: "JxaAnyDoc",
  target: "es2020",
  define: {
    "__EMBEDDED_WASM_B64__": JSON.stringify(Buffer.from(wasmBytes).toString("base64")),
    "__EMBEDDED_GLUE_CODE__": JSON.stringify(glueCode)
  },
  logLevel: "info"
};
const cli = path.join(outDir, "anydoc-wasm.osascript.js");
const automator = path.join(outDir, "anydoc-wasm.automator.js");
esbuild.buildSync({
  ...common,
  outfile: cli,
  banner: {js: "#!/usr/bin/osascript -l JavaScript"},
  footer: {js: "\nfunction run(argv) { return JxaAnyDoc.run(argv); }\n"}
});
fs.chmodSync(cli, 0o755);
esbuild.buildSync({
  ...common,
  outfile: automator,
  footer: {js: `
function run(input, parameters) {
  ObjC.import("Foundation");
  if (!input || input.length !== 1) {
    throw new Error("Select exactly one PDF file or one folder in Finder.");
  }
  var item = input[0];
  var posixPath;
  if (typeof item === "string") {
    posixPath = item;
  } else {
    // Finder objects are typically Automator aliases/Path objects; coerce
    // their POSIX representation via NSURL, not via a shell or subprocess.
    var raw = item.toString();
    posixPath = ObjC.unwrap($.NSURL.fileURLWithPath(raw).path);
  }
  if (typeof posixPath !== "string" || !posixPath) {
    throw new Error("Automator did not supply a valid POSIX path.");
  }
  var response = JxaAnyDoc.run([posixPath]);
  var prefix = "ANYDOC_BATCH_JSON=";
  if (response.indexOf(prefix) !== 0) throw new Error("Unexpected AnyDoc result.");
  var result = JSON.parse(response.slice(prefix.length));
  if (result.failureCount) {
    throw new Error("AnyDoc failed converting " + result.failureCount + " PDF(s): " +
      JSON.stringify(result.failures));
  }
  // Preserve the original Finder selection for subsequent Automator actions.
  return input;
}
`}
});
console.log(JSON.stringify({
  artifacts: ["dist/anydoc-wasm.osascript.js", "dist/anydoc-wasm.automator.js"],
  wasmBytes: wasmBytes.length,
  glueBytes: Buffer.byteLength(glueCode),
  bundleBytes: {
    osascript: fs.statSync(cli).size,
    automator: fs.statSync(automator).size
  },
  jsc: false,
  runtimeDependencies: []
}));
