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
  conversions: ConversionResult[];
  failureCount?: number;
  failures?: Array<{input: string; message: string}>;
}
interface Task { input: string; output: string; }
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
  if (!inputPaths.length) throw new Error("Usage: <script> [--output-dir DIR] FILE.pdf [FILE2.pdf ...] | DIRECTORY");
  return {outputDir, inputPaths};
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
  const {outputDir, inputPaths} = parseArguments(argv);
  const roots = inputPaths.filter(p => port.stat(p) === "directory");
  if (roots.length && (inputPaths.length !== 1 || roots.length !== 1))
    throw new Error("Directory mode accepts exactly one directory; do not mix directories and PDF paths");
  const tasks: Task[] = [];
  if (roots.length) {
    const root = normalized(roots[0]), target = normalized(outputDir || outputRoot(root));
    if (target === root || target.startsWith(root + "/")) throw new Error("Output must be outside the input directory");
    const pdfs = discover(root, port);
    for (const input of pdfs) {
      const relative = input.slice(root.length).replace(/^\//, "");
      tasks.push({input, output: join(target, markdown(relative))});
    }
  } else {
    for (const input of inputPaths) {
      if (port.stat(input) !== "file") throw new Error("Missing or unsupported input file: " + input);
      if (!/\.pdf$/i.test(input)) throw new Error("Expected .pdf path: " + input);
      const dest = outputDir ? join(outputDir, basename(markdown(input))) : markdown(input);
      tasks.push({input, output: dest});
    }
  }
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
  const failures: Array<{input: string; message: string}> = [];
  if (tasks.length) {
    const engine = getAnyDocSingleton(assets);
    for (const task of tasks) {
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
    failureCount: failures.length, failures
  };
}
