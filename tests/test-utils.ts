export const PROBE_PREFIX = "JXA_RESULT=";
export const ANYDOC_PREFIX = "ANYDOC_RESULT_JSON=";
export const BATCH_PREFIX = "ANYDOC_BATCH_JSON=";

export interface CapabilityEntry {
  status: "supported" | "unavailable" | "error" | "not_tested";
  detail: string;
}
export interface CapabilityResult {
  schema: 1;
  globals: Record<string, string>;
  capabilities: Record<string, CapabilityEntry>;
}
export interface AnyDocResult extends Record<string, unknown> {
  schema: 1;
  engine: string;
  success: boolean;
}
export interface BatchResult extends Record<string, unknown> {
  schema: 1;
  runtime: "Node" | "JXA";
  mode: "single-process";
  wasmInitializationCount: number;
  conversionCount: number;
  conversions: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseObjectAt(input: string): unknown {
  const source = input.trimStart();
  if (!source.startsWith("{")) throw new Error("JSON object missing after marker");
  let depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(source.slice(0, i + 1)) as unknown;
  }
  throw new Error("Incomplete JSON object");
}
export function extractPrefixedJson<T>(
  output: string, prefix: string, validate: (value: unknown) => value is T
): T {
  for (const line of output.split(/\r?\n/)) {
    const at = line.indexOf(prefix);
    if (at < 0) continue;
    try {
      const value = parseObjectAt(line.slice(at + prefix.length));
      if (validate(value)) return value;
    } catch { /* Ignore malformed markers; a later valid result may follow. */ }
  }
  throw new Error("Structured JSON marker not found or invalid: " + prefix);
}
function isCapabilityResult(value: unknown): value is CapabilityResult {
  return isRecord(value) && value.schema === 1 && isRecord(value.globals) &&
    isRecord(value.capabilities) && Object.values(value.capabilities).every((entry) =>
      isRecord(entry) && ["supported", "unavailable", "error", "not_tested"].includes(String(entry.status)));
}
export function extractProbeResult(output: string): CapabilityResult {
  return extractPrefixedJson(output, PROBE_PREFIX, isCapabilityResult);
}
function isAnyDocResult(value: unknown): value is AnyDocResult {
  return isRecord(value) && value.schema === 1 &&
    typeof value.engine === "string" && typeof value.success === "boolean";
}
export function extractAnyDocResult(output: string): AnyDocResult {
  const at = output.indexOf(ANYDOC_PREFIX);
  if (at < 0) throw new Error("Structured AnyDoc result marker absent");
  const value = parseObjectAt(output.slice(at + ANYDOC_PREFIX.length));
  if (!isAnyDocResult(value)) throw new Error("Invalid AnyDoc result schema");
  return value;
}
function isBatchResult(value: unknown): value is BatchResult {
  return isRecord(value) && value.schema === 1 &&
    (value.runtime === "Node" || value.runtime === "JXA") &&
    value.mode === "single-process" &&
    typeof value.wasmInitializationCount === "number" &&
    typeof value.conversionCount === "number" && Array.isArray(value.conversions);
}
export function extractBatchOutput(output: string): BatchResult {
  const at = output.indexOf(BATCH_PREFIX);
  if (at < 0) throw new Error("Missing ANYDOC_BATCH_JSON structured marker");
  const value = parseObjectAt(output.slice(at + BATCH_PREFIX.length));
  if (!isBatchResult(value)) throw new Error("Malformed batch result schema");
  return value;
}
export function mdEscape(value: unknown): string {
  return String(value).replace(/\|/g, "\\|").replace(/\r/g, " ").replace(/\n/g, " ").slice(0, 240);
}
export function safe(value: unknown, limit = 320): string {
  return String(value).replace(/\|/g, "/").replace(/\r/g, " ").replace(/\n/g, " ").slice(0, limit);
}
export function validateMarkdownBytes(bytes: Uint8Array): {text: string; bytes: number} {
  if (bytes.byteLength < 30) throw new Error("Markdown missing or too short");
  const text = new TextDecoder("utf-8", {fatal: true}).decode(bytes);
  if (text.trim().length < 30) throw new Error("Markdown text is empty or too short");
  if (text.includes("\ufffd")) throw new Error("Markdown contains UTF-8 replacement character");
  for (const marker of ["Direct JXA Export", "Executed without WASM",
    "MARKDOWN_OUTPUT_START", "MARKDOWN_OUTPUT_END", "ERROR:",
    "ANYDOC_BATCH_JSON=", "ANYDOC_RESULT_JSON="]) {
    if (text.includes(marker)) throw new Error("Placeholder/protocol/error text found in Markdown");
  }
  return {text, bytes: bytes.byteLength};
}
