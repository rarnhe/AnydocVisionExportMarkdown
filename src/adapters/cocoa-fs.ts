import { decodeBase64 } from "../shared/base64";
import type { FilePort, EntryKind } from "../ports/file-port";
declare const ObjC: any;
declare const $: any;
function ns(value: string): any { return $.NSString.stringWithString(String(value)); }
function unwrap(value: any): string { return String(ObjC.unwrap(value)); }
export function createCocoaFilePort(): FilePort {
  if (typeof ObjC === "undefined") throw new Error("JXA Objective-C bridge unavailable");
  ObjC.import("Foundation");
  const fm = $.NSFileManager.defaultManager;
  function stat(path: string): EntryKind | "missing" {
    const attributes = fm.attributesOfItemAtPathError(ns(path), null);
    if (!attributes) return "missing";
    const type = unwrap(attributes.objectForKey($.NSFileType));
    if (type === unwrap($.NSFileTypeSymbolicLink)) return "symlink";
    if (type === unwrap($.NSFileTypeDirectory)) return "directory";
    if (type === unwrap($.NSFileTypeRegular)) return "file";
    return "other";
  }
  return {
    stat,
    listEntries(path) {
      const values = fm.contentsOfDirectoryAtPathError(ns(path), null);
      if (!values) throw new Error("Cannot list directory: " + path);
      const result: Array<{name: string; kind: EntryKind}> = [];
      for (let i = 0; i < Number(values.count); i++) {
        const name = unwrap(values.objectAtIndex(i));
        result.push({name, kind: stat(path.replace(/\/+$/, "") + "/" + name) as EntryKind});
      }
      return result;
    },
    readBytes(path) {
      const data = $.NSData.dataWithContentsOfFile(ns(path));
      if (!data || Number(data.length) < 5) throw new Error("Missing/empty PDF: " + path);
      const base64 = ObjC.unwrap(data.base64EncodedStringWithOptions(0));
      if (typeof base64 !== "string") throw new Error("NSData Base64 bridge returned non-string");
      return decodeBase64(base64);
    },
    writeText(path, content) {
      if (stat(path) !== "missing") throw new Error("Markdown already exists: " + path);
      const ok = ns(content).writeToFileAtomicallyEncodingError(ns(path), true, $.NSUTF8StringEncoding, null);
      if (!ok) throw new Error("Foundation could not write " + path);
    },
    ensureDirectory(path) {
      const ok = fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
        ns(path), true, $.NSDictionary.dictionary, null
      );
      if (!ok) throw new Error("Foundation could not create directory " + path);
    }
  };
}
