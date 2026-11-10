import {parseNeedsOcr} from "./needs-ocr";
import {AnyDocAssets, getAnyDocSingleton, getWasmInitializationCount} from "./engine";
import type {FilePort} from "../ports/file-port";

export interface ConversionResult {input: string; output: string; markdownCharacters: number; ocrRecovery?: {code:"needsOcr";pages:number[];pageCount:number}}
export interface ConversionTask {input: string; output: string}
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

const SUPPORTED = /\.(pdf|doc|docx|docm|ppt|pps|pot|pptx|pptm|ppsx|ppsm|xls|xlsx|xlsm|xlsb|odt|ods|odp|rtf|epub|csv)$/i;
/** Exactly one supported document or one directory; multiple inputs and flags unsupported. */
export function parseArguments(argv: string[]): string {
  if (argv.length !== 1 || !argv[0] || String(argv[0]).startsWith("--")) {
    throw new Error("Usage: <script> INPUT.(AnyDoc-supported format) | INPUT_DIRECTORY (exactly one input; no options)");
  }
  return String(argv[0]);
}
function normalize(input: string): string {
  const absolute = input.startsWith("/");
  const parts: string[] = [];
  for (const segment of input.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (parts.length && parts[parts.length - 1] !== "..") parts.pop();
      else if (!absolute) parts.push("..");
    } else parts.push(segment);
  }
  return (absolute ? "/" : "") + parts.join("/") || (absolute ? "/" : ".");
}
function join(base: string, name: string): string {
  return normalize(base.replace(/\/+$/, "") + "/" + name);
}
function dirname(name: string): string {
  const value = normalize(name), slash = value.lastIndexOf("/");
  return slash < 0 ? "." : slash === 0 ? "/" : value.slice(0, slash);
}
function relativePath(parent: string, child: string): string {
  const prefix = parent === "/" ? "/" : parent + "/";
  if (!child.startsWith(prefix)) throw new Error("Path is outside input tree: " + child);
  return child.slice(prefix.length);
}
function discoverDocuments(root: string, port: FilePort): string[] {
  const files: string[] = [], stack = [root];
  while (stack.length) {
    const directory = stack.pop()!;
    const entries = port.listEntries(directory).slice().sort((a,b) => a.name.localeCompare(b.name));
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (!entry.name || entry.name === "." || entry.name === ".." ||
          entry.name.includes("/")) throw new Error("Unsafe directory entry: " + entry.name);
      const full = join(directory, entry.name);
      if (entry.kind === "directory") stack.push(full);
      else if (entry.kind === "file" && SUPPORTED.test(entry.name)) files.push(full);
    }
  }
  return files.sort();
}
function availablePath(base: string, port: FilePort, suffix: (n: number) => string, start: number): string {
  let candidate = base, n = start;
  while (port.stat(candidate) !== "missing") {
    candidate = base + suffix(n++);
    if (!Number.isSafeInteger(n)) throw new Error("Output suffix exhausted: " + base);
  }
  return candidate;
}
function availableMarkdown(stem: string, port: FilePort): string {
  let n = 0;
  while (true) {
    const candidate = stem + (n ? "-" + n : "") + ".md";
    if (port.stat(candidate) === "missing") return candidate;
    if (!Number.isSafeInteger(++n)) throw new Error("Markdown suffix exhausted");
  }
}
export function planConversions(argv: string[], port: FilePort): ConversionTask[] {
  const input = normalize(parseArguments(argv)), kind = port.stat(input);
  if (kind === "file") {
    if (!SUPPORTED.test(input)) throw new Error("Expected an AnyDoc-supported document format: " + input);
    const stem = input.replace(SUPPORTED, "");
    // Same directory: file.md, file-1.md, file-2.md, ...
    return [{input, output: availableMarkdown(stem, port)}];
  }
  if (kind !== "directory") throw new Error("Expected a supported document file or existing directory: " + input);
  if (input === "/" || input === "." || input === ".." || input.endsWith("/..")) {
    throw new Error("Specify a named directory, not filesystem root/current directory");
  }
  const base = input + "_md";
  // Every folder run creates a new sibling tree: A_md, A_md 2, A_md 3, ...
  const destination = availablePath(base, port, n => " " + n, 2);
  // Reserve each planned Markdown path as well as checking existing files.
  // Different source extensions can share the same stem in one directory.
  const seen = new Set<string>();
  return discoverDocuments(input,port).map(source => {
    const stem = join(destination,relativePath(input,source).replace(SUPPORTED, ""));
    let n = 0, output: string;
    do {
      output = stem + (n ? "-" + n : "") + ".md";
      if (!Number.isSafeInteger(++n)) throw new Error("Markdown suffix exhausted: " + stem);
    } while (seen.has(output.toLowerCase()) || port.stat(output) !== "missing");
    seen.add(output.toLowerCase());
    return {input:source,output};
  });
}
export function processInputs(
  argv: string[], port: FilePort, assets: AnyDocAssets, runtime: "Node" | "JXA",
  recover?: (input:string, request:NonNullable<ReturnType<typeof parseNeedsOcr>>, engine:ReturnType<typeof getAnyDocSingleton>)=>string
): ProcessingResult {
  const tasks = planConversions(argv,port);
  const conversions: ConversionResult[] = [];
  const skipped: Array<{input:string;output:string}> = [];
  const failures: Array<{input:string;message:string;ocrRecovery?:{code:"needsOcr";pages:number[];pageCount:number}}> = [];
  // Both modes create new destinations; no old Markdown is silently skipped.
  if (tasks.length) {
    const engine = getAnyDocSingleton(assets);
    for (const task of tasks) {
      let ocrRecovery:ReturnType<typeof parseNeedsOcr>=null;
      try {
        let markdown:string;
        try {
          const type=task.input.toLowerCase().slice(task.input.lastIndexOf(".")+1);
          markdown=engine.convert(port.readBytes(task.input),type);
        } catch(error) {
          const request=parseNeedsOcr(error);
          if(!request || !recover || !/\.pdf$/i.test(task.input))throw error;
          ocrRecovery=request;
          markdown=recover(task.input,request,engine);
        }
        if (ocrRecovery && markdown.trim().length === 0) {
          // Every page was image-only/blank and Vision found no text. Do not
          // create an empty Markdown file or a separator-only document.
          skipped.push({input:task.input,output:task.output});
          continue;
        }
        port.ensureDirectory(dirname(task.output));
        port.writeText(task.output,markdown);
        conversions.push({input:task.input,output:task.output,markdownCharacters:markdown.length,
          ...(ocrRecovery?{ocrRecovery:{code:"needsOcr" as const,pages:ocrRecovery.pages,pageCount:ocrRecovery.pageCount}}:{})});
      } catch(error) {
        failures.push({input:task.input,message:String(error),
          ...(ocrRecovery?{ocrRecovery:{code:"needsOcr" as const,pages:ocrRecovery.pages,pageCount:ocrRecovery.pageCount}}:{})});
      }
    }
  }
  return {schema:1,runtime,mode:"single-process",wasmInitializationCount:getWasmInitializationCount(),
    discoveredCount:tasks.length,conversionCount:conversions.length,conversions,
    skippedCount:skipped.length,skipped,failureCount:failures.length,failures};
}
