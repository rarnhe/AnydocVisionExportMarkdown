#!/usr/bin/env node
"use strict";
// npm ci might fail; this aggregator deliberately has no npm dependencies.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const report = path.join(root, "test_report.md");
const stages = [
  ["npm ci", "STAGE_DEPS", "npm-install.log"],
  ["PDF/Office format SHA256", "STAGE_FORMATS", "formats-runner.log"],
  ["Doctor", "STAGE_DOCTOR", "doctor.log"],
  ["TypeScript typecheck", "STAGE_TYPES", "typecheck.log"],
  ["Unit + JXA probe", "STAGE_PROBES", "probes-runner.log"],
  ["Node/JXA directory SHA256", "STAGE_DIRECTORY", "directory-runner.log"],
  ["OCR metadata unit", "STAGE_OCR_UNIT", "ocr-unit.log"],
  ["Real PDFKit/Vision OCR file and directory", "STAGE_OCR", "ocr-runner.log"]
];
if (!fs.existsSync(report)) fs.writeFileSync(report, "# JXA test report\n\n- FAIL: earlier stages produced no report.\n");
const lines = ["", "## CI 最终阶段状态", ""];
for (const [name, env] of stages) lines.push("- " + name + ": **" + (process.env[env] || "unknown").toUpperCase() + "**");
lines.push("", "## 失败阶段日志摘要", "");
const failed = stages.filter(([,env]) => process.env[env] !== "success");
for (const [name, , log] of failed) {
  const file = path.join(root, "tests/output", log);
  lines.push("### " + name, "");
  if (fs.existsSync(file)) {
    const tail = fs.readFileSync(file, "utf8").split(/\r?\n/).slice(-25).map(line => line.slice(0, 450));
    lines.push("```text", ...tail, "```", "");
  } else lines.push("- 日志不存在（该阶段可能未能启动）。", "");
  // Unit-test details are captured in a separate log by run-probes.ts;
  // include them here so the committed report identifies the actual assertion.
  if (name === "Unit + JXA probe") {
    const unitLog = path.join(root, "tests/output/unit-tests.log");
    if (fs.existsSync(unitLog)) {
      const tail = fs.readFileSync(unitLog, "utf8").split(/\r?\n/).slice(-70).map(line => line.slice(0, 450));
      lines.push("#### Node unit test details", "", "```text", ...tail, "```", "");
    }
  }
}
if (!failed.length) lines.push("- 无，所有必要阶段通过。", "");
fs.appendFileSync(report, lines.join("\n") + "\n", "utf8");
if (process.env.GITHUB_STEP_SUMMARY)
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, fs.readFileSync(report, "utf8"), "utf8");
console.log(lines.join("\n"));
