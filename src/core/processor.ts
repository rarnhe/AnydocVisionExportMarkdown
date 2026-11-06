import {AnyDocAssets, getAnyDocSingleton, getWasmInitializationCount} from "./engine";
import type {FilePort} from "../ports/file-port";

export interface ConversionResult {
  input: string;
  output: string;
  markdownCharacters: number;
}
export interface ProcessingResult {
  schema: 1;
  runtime: "Node" | "JXA";
  mode: "single-process";
  wasmInitializationCount: number;
  discoveredCount: number;
  conversionCount: number;
  conversions: ConversionResult[];
  skippedCount: number;
  skipped: Array<{input: string; output: string}>;
  failureCount: number;
  failures: Array<{input: string; message: string}>;
}
export interface ConversionTask {input: string; output: string}

export function parseArguments(argv: string[]): {outputDir?: string; inputDir: string} {
  let outputDir: string | undefined;
  const directories: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = String(argv[i]);
    if (arg === "--") continue;
    if (arg === "--output-dir") {
      if (++i === argv.length || !argv[i] || String(argv[i]).startsWith("--")) {
        throw new Error("--output-dir requires a directory path");
      }
      outputDir = String(argv[i]);
    } else if (arg.startsWith("--")) {
      throw new Error("Unknown option: " + arg);
    } else {
      directories.push(arg);
    }
  }
  if (directories.length !== 1) {
    throw new Error("Usage: <script> [--output-dir OUTPUT_DIR] INPUT_DIRECTORY (exactly one directory)");
  }
  return {outputDir, inputDir: directories[0]};
}

// These are POSIX paths: the JXA deliverable targets macOS.
function normalize(input: string): string {
  const absolute = input.startsWith("/");
  const parts: string[] = [];
  for (const segment of input.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (parts.length && parts[parts.length - 1] !== "..") parts.pop();
      else if (!absolute) parts.push("..");
    } else {
      parts.push(segment);
    }
  }
  return (absolute ? "/" : "") + parts.join("/") || (absolute ? "/" : ".");
}
function join(base: string, name: string): string {
  return normalize(base.replace(/\/+$/, "") + "/" + name);
}
function dirname(name: string): string {
  const value = normalize(name);
  const slash = value.lastIndexOf("/");
  return slash < 0 ? "." : slash === 0 ? "/" : value.slice(0, slash);
}
function relativePath(parent: string, child: string): string {
  const prefix = parent === "/" ? "/" : parent + "/";
  if (!child.startsWith(prefix)) throw new Error("Path is outside input tree: " + child);
  return child.slice(prefix.length);
}
function outputRoot(input: string): string {
  const clean = normalize(input);
  if (clean === "/" || clean === "." || clean === ".." || clean.endsWith("/..")) {
    throw new Error("Specify a named input folder, not filesystem root or current directory");
  }
  return clean + "_md";
}
function isWithin(parent: string, child: string): boolean {
  return child === parent || child.startsWith((parent === "/" ? "" : parent) + "/");
}

function discoverPdfs(root: string, port: FilePort): string[] {
  const files: string[] = [];
  const stack = [root];
  while (stack.length) {
    const directory = stack.pop()!;
    const entries = port.listEntries(directory).slice().sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    // Reversed push keeps traversal order deterministic, independent of host enumeration.
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (!entry.name || entry.name === "." || entry.name === ".." ||
          entry.name.indexOf("/") !== -1) {
        throw new Error("Unsafe directory entry: " + entry.name);
      }
      const fullPath = join(directory, entry.name);
      if (entry.kind === "directory") stack.push(fullPath);
      else if (entry.kind === "file" && /\.pdf$/i.test(entry.name)) files.push(fullPath);
      // Do not follow symbolic links, including symlinked directories.
    }
  }
  return files.sort();
}

export function planConversions(argv: string[], port: FilePort): ConversionTask[] {
  const {inputDir, outputDir} = parseArguments(argv);
  if (port.stat(inputDir) !== "directory") {
    throw new Error("Expected an existing directory, not an individual PDF: " + inputDir);
  }
  const source = normalize(inputDir);
  const destination = normalize(outputDir || outputRoot(source));
  if (isWithin(source, destination) || isWithin(destination, source)) {
    throw new Error("Input and output directories must be distinct and disjoint");
  }
  // Validate all destinations before any write or WASM initialization.
  const tasks = discoverPdfs(source, port).map(input => {
    const relative = relativePath(source, input);
    return {input, output: join(destination, relative.slice(0, -4) + ".md")};
  });
  const destinations = new Set<string>();
  for (const task of tasks) {
    // macOS commonly uses case-insensitive file systems.
    const key = task.output.toLowerCase();
    if (destinations.has(key)) throw new Error("Markdown output collision: " + task.output);
    destinations.add(key);
  }
  return tasks;
}

export function processInputs(
  argv: string[], port: FilePort, assets: AnyDocAssets, runtime: "Node" | "JXA"
): ProcessingResult {
  const tasks = planConversions(argv, port);
  const skipped: Array<{input: string; output: string}> = [];
  const pending: ConversionTask[] = [];
  for (const task of tasks) {
    const kind = port.stat(task.output);
    if (kind === "file") skipped.push(task);
    else if (kind === "missing") pending.push(task);
    else throw new Error("Output path exists but is not a regular file: " + task.output);
  }

  const conversions: ConversionResult[] = [];
  const failures: Array<{input: string; message: string}> = [];
  if (pending.length) {
    // Only initialize WASM when at least one conversion is required.
    const engine = getAnyDocSingleton(assets);
    for (const task of pending) {
      try {
        const markdown = engine.convertPdf(port.readBytes(task.input));
        port.ensureDirectory(dirname(task.output));
        // FilePort.writeText must create exclusively, never overwrite.
        port.writeText(task.output, markdown);
        conversions.push({input: task.input, output: task.output, markdownCharacters: markdown.length});
      } catch (error) {
        if (port.stat(task.output) === "file") {
          // Another process may have created the file while converting.
          skipped.push(task);
        } else {
          failures.push({input: task.input, message: String(error)});
        }
      }
    }
  }
  return {
    schema: 1, runtime, mode: "single-process",
    wasmInitializationCount: getWasmInitializationCount(),
    discoveredCount: tasks.length,
    conversionCount: conversions.length, conversions,
    skippedCount: skipped.length, skipped,
    failureCount: failures.length, failures
  };
}
