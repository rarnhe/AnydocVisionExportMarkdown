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
// Automator's editor expects the complete pasted source to start with run(input, parameters).
// Embed the entire self-contained esbuild IIFE INSIDE that function, not before it.
const automatorBuild = esbuild.buildSync({
  ...common,
  write: false,
  outfile: automator,
  logLevel: "silent"
});
const embeddedBundle = automatorBuild.outputFiles.find(file => file.path === automator);
if (!embeddedBundle) throw new Error("Automator bundle output missing");
const automatorSource = `function run(input, parameters) {
  // Automator's default Run JavaScript action entrypoint.
  ObjC.import("Foundation");
  if (!input || input.length !== 1) {
    throw new Error("Select exactly one PDF file or one folder in Finder.");
  }
  var item = input[0];
  var posixPath;
  if (typeof item === "string") {
    posixPath = item;
  } else {
    var raw = item.toString();
    posixPath = ObjC.unwrap($.NSURL.fileURLWithPath(raw).path);
  }
  if (typeof posixPath !== "string" || !posixPath) {
    throw new Error("Automator did not supply a valid POSIX path.");
  }
  // Self-contained TypeScript engine and embedded AnyDoc WASM:
` + embeddedBundle.text + `
  var response = JxaAnyDoc.run([posixPath]);
  var prefix = "ANYDOC_BATCH_JSON=";
  if (response.indexOf(prefix) !== 0) throw new Error("Unexpected AnyDoc result.");
  var result = JSON.parse(response.slice(prefix.length));
  if (result.failureCount) {
    throw new Error("AnyDoc failed converting " + result.failureCount + " PDF(s): " +
      JSON.stringify(result.failures));
  }
  // Keep the Finder selection available to subsequent Automator actions.
  return input;
}
`;
fs.writeFileSync(automator, automatorSource, "utf8");

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
