import { AnyDocAssets, getAnyDocSingleton, getWasmInitializationCount } from "./engine";

import type { FilePort } from "../ports/file-port";

export interface ConversionResult {
  input: string;
  output: string;
  markdownCharacters: number;
}

export interface BatchResult {
  schema: number;
  runtime: "Node" | "JXA";
  mode: "single-process";
  wasmInitializationCount: number;
  conversionCount: number;
  conversions: ConversionResult[];
}

export function parseArguments(argv: string[]): {outputDir?: string; inputPaths: string[]} {
  let outputDir: string | undefined;
  const inputPaths: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i]);
    if (arg === "--") continue;
    if (arg === "--output-dir") {
      if (i + 1 >= argv.length) throw new Error("--output-dir requires a path");
      outputDir = String(argv[++i]);
      continue;
    }
    if (arg.startsWith("--")) throw new Error("Unknown option: " + arg);
    inputPaths.push(arg);
  }
  if (inputPaths.length === 0) {
    throw new Error("Usage: <script> [--output-dir DIR] FILE.pdf [FILE2.pdf ...]");
  }
  return {outputDir, inputPaths};
}

function markdownPath(input: string, outDir?: string): string {
  if (!/\.pdf$/i.test(input)) throw new Error("Expected .pdf path: " + input);
  const result = input.slice(0, -4) + ".md";
  if (!outDir) return result;
  const name = result.replace(/\\/g, "/").split("/").pop() || "output.md";
  return outDir.replace(/\/+$/, "") + "/" + name;
}

export function convertBatch(
  argv: string[], filePort: FilePort, assets: AnyDocAssets, runtime: "Node" | "JXA"
): BatchResult {
  const {outputDir, inputPaths} = parseArguments(argv);
  if (outputDir) filePort.ensureDirectory(outputDir);
  // This call, and WebAssembly.Module/Instance construction, occur exactly once.
  const engine = getAnyDocSingleton(assets);
  const conversions: ConversionResult[] = [];
  for (const input of inputPaths) {
    const pdf = filePort.readBytes(input);
    const markdown = engine.convertPdf(pdf);
    const dest = markdownPath(input, outputDir);
    filePort.writeText(dest, markdown);
    conversions.push({input, output: dest, markdownCharacters: markdown.length});
  }
  return {
    schema: 1, runtime, mode: "single-process",
    wasmInitializationCount: getWasmInitializationCount(),
    conversionCount: conversions.length, conversions
  };
}
