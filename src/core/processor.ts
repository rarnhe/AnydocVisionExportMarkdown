import { AnyDocAssets, getAnyDocSingleton, getWasmInitializationCount } from "./engine";
import type { FilePort } from "../ports/file-port";

export interface ConversionResult {
  input: string;
  output: string;
  markdownCharacters: number;
}
export interface ProcessingResult {
  schema: number;
  runtime: "Node" | "JXA";
  mode: "single-process";
  wasmInitializationCount: number;
  conversionCount: number;
  conversions: ConversionResult[];\n  skippedCount: number;\n  skipped: Array<{input: string; output: string}>;
  failureCount?: number;
  failures?: Array<{input: string; message: string}>;
}
interface Task { input: string; output: string; }
export function parseArguments(argv: string[]): {outputDir?: string; inputDir: string} {
  let outputDir: string | undefined;
  const inputs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i]);
    if (arg === "--") continue;
    if (arg === "--output-dir") {
      if (i + 1 >= argv.length) throw new Error("--output-dir requires a path");
      outputDir = String(argv[++i]); continue;
    }
    if (arg.startsWith("--")) throw new Error("Unknown option: " + arg);
    inputs.push(arg);
  }
  if (inputs.length !== 1) throw new Error("Usage: <script> [--output-dir DIR] DIRECTORY (exactly one directory)");
  return {outputDir, inputDir: inputs[0]};
}
function normalized(path: string): string {
  const raw = path.replace(/\\/g, "/");
  const absolute = raw.startsWith("/");
  const segments: string[] = [];
  for (const part of raw.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (segments.length && segments[segments.length - 1] !== "..") segments.pop();
      else if (!absolute) segments.push("..");
    } else segments.push(part);
  }
  return (absolute ? "/" : "") + segments.join("/") || (absolute ? "/" : ".");
}
function join(parent: string, child: string): string {
  return normalized(parent.replace(/\/+$/, "") + "/" + child);
}
function parent(path: string): string {
  const p = normalized(path), i = p.lastIndexOf("/");
  return i < 0 ? "." : i === 0 ? "/" : p.slice(0, i);
}
function basename(path: string): string { return normalized(path).split("/").pop() || ""; }
function markdown(path: string): string { return path.slice(0, -4) + ".md"; }
function outputRoot(input: string): string {
  const p = normalized(input);
  if (p === "/" || p === ".") throw new Error("Specify a named input directory, not filesystem root/current directory");
  return p + "_md";
}
function discover(root: string, port: FilePort): string[] {
  const found: string[] = [];
  const visit = (dir: string): void => {
    const entries = port.listEntries(dir).slice().sort((a,b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
      if (!entry.name || entry.name === "." || entry.name === ".." || entry.name.includes("/") || entry.name.includes("\\"))
        throw new Error("Invalid directory entry: " + entry.name);
      const full = join(dir, entry.name);
      if (entry.kind === "directory") visit(full);
      else if (entry.kind === "file" && /\.pdf$/i.test(entry.name)) found.push(full);
      // Ignore symlinks to prevent cycles and escaping the input tree.
    }
  };
  visit(root);
  return found;
}
export function planConversions(argv: string[], port: FilePort): Task[] {
  const {outputDir, inputDir} = parseArguments(argv);
  if (port.stat(inputDir) !== "directory") throw new Error("Expected an existing directory: " + inputDir);
  const root = normalized(inputDir), target = normalized(outputDir || outputRoot(root));
  if (target === root || target.startsWith(root + "/")) throw new Error("Output must be outside input directory");
  const tasks = discover(root, port).map(input => ({
    input, output: join(target, markdown(input.slice(root.length).replace(/^\\//, "")))
  }));
  const seen = new Set<string>();
  for (const task of tasks) {
    const key = normalized(task.output).toLowerCase();
    if (seen.has(key)) throw new Error("Markdown output collision: " + task.output);
    seen.add(key);
  }
  return tasks;
}
export function processInputs(
  argv: string[], port: FilePort, assets: AnyDocAssets, runtime: "Node" | "JXA"
): ProcessingResult {
  const tasks = planConversions(argv, port);
  const conversions: ConversionResult[] = [];
  const skipped: Array<{input: string; output: string}> = [];
  const failures: Array<{input: string; message: string}> = [];
  const pending = tasks.filter(task => {
    const kind = port.stat(task.output);
    if (kind === "missing") return true;
    if (kind !== "file") throw new Error("Output is not a regular file: " + task.output);
    skipped.push({input: task.input, output: task.output});
    return false;
  });
  if (pending.length) {
    const engine = getAnyDocSingleton(assets);
    for (const task of pending) {
      try {
        const content = engine.convertPdf(port.readBytes(task.input));
        port.ensureDirectory(parent(task.output));
        port.writeText(task.output, content);
        conversions.push({input: task.input, output: task.output, markdownCharacters: content.length});
      } catch (error) {
        failures.push({input: task.input, message: String(error)});
      }
    }
  }
  return {
    schema: 1, runtime, mode: "single-process",
    wasmInitializationCount: getWasmInitializationCount(),
    conversionCount: conversions.length, conversions,
    skippedCount: skipped.length, skipped,
    failureCount: failures.length, failures
  };
}
