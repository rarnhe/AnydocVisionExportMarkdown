#!/usr/bin/env node
"use strict";
/* Node-only checkout and toolchain diagnostics. */
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const required = [
  "build.js", "package.json", "package-lock.json", "tsconfig.json",
  "src/hosts/node.ts", "src/hosts/node-assets.ts", "src/hosts/jxa.ts",
  "src/adapters/node-fs.ts", "src/adapters/cocoa-fs.ts",
  "src/core/engine.ts", "src/core/processor.ts", "src/ports/file-port.ts", "src/shared/base64.ts",
  "tests/chunk_1.pdf", "tests/unit.test.ts", "tests/test-utils.ts",
  "tests/probe.js", "tests/run-probes.ts", "tests/run-directory.ts"
];
const failures = [];
function output(level, message) { process.stdout.write("[" + level + "] " + message + "\n"); }
output("INFO", "Repo: " + root);
output("INFO", "Node: " + process.version + "; OS: " + process.platform);
if (Number(process.versions.node.split(".")[0]) < 22) failures.push("Node.js 22 or later is required.");
if (process.platform !== "darwin") output("WARN", "JXA execution requires macOS.");
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) failures.push("Missing " + file);
  else output("OK", file);
}
for (const dep of ["tsx", "esbuild", "@firecrawl/anydoc-wasm", "typescript"]) {
  if (!fs.existsSync(path.join(root, "node_modules", ...dep.split("/")))) {
    failures.push("Dependency missing: " + dep + " (run npm ci)");
  } else output("OK", "Installed " + dep);
}
if (fs.existsSync(path.join(root, "src", "jsc"))) failures.push("Obsolete src/jsc directory must not exist.");
function walk(dir, predicate, message) {
  for (const item of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full, predicate, message);
    else if (item.isFile() && predicate(full)) failures.push(message + path.relative(root, full));
  }
}
walk(path.join(root, "src"), (file) => !file.endsWith(".ts"), "Non-TypeScript application source: ");
walk(path.join(root, "tests"), (file) => file.endsWith(".py"), "Python test file is not allowed: ");
for (const failure of failures) output("FAIL", failure);
if (failures.length) {
  output("HELP", "Run: npm ci && npm run doctor && npm test");
  process.exitCode = 1;
} else output("PASS", "JXA-only TypeScript/JavaScript test checkout and dependencies are ready.");
