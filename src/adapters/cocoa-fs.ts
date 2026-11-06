import {decodeBase64} from "../shared/base64";
import type {FilePort, EntryKind} from "../ports/file-port";

declare const ObjC: any;
declare const $: any;

function ns(value: string): any { return $.NSString.stringWithString(String(value)); }
function unwrap(value: any): string { return String(ObjC.unwrap(value)); }

/** JXA file-system adapter; the core never accesses Objective-C directly. */
export function createCocoaFilePort(): FilePort {
  if (typeof ObjC === "undefined") throw new Error("JXA Objective-C bridge unavailable");
  ObjC.import("Foundation");
  const manager = $.NSFileManager.defaultManager;

  function stat(path: string): EntryKind | "missing" {
    const attrs = manager.attributesOfItemAtPathError(ns(path), null);
    if (!attrs) return "missing";
    const type = unwrap(attrs.objectForKey($.NSFileType));
    if (type === unwrap($.NSFileTypeDirectory)) return "directory";
    if (type === unwrap($.NSFileTypeRegular)) return "file";
    if (type === unwrap($.NSFileTypeSymbolicLink)) return "symlink";
    return "other";
  }
  return {
    stat,
    listEntries(path) {
      const entries = manager.contentsOfDirectoryAtPathError(ns(path), null);
      if (!entries) throw new Error("Cannot enumerate directory: " + path);
      const found: Array<{name: string; kind: EntryKind}> = [];
      for (let index = 0; index < Number(entries.count); index++) {
        const name = unwrap(entries.objectAtIndex(index));
        found.push({name, kind: stat(path.replace(/\/+$/, "") + "/" + name) as EntryKind});
      }
      return found;
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
      // NSData writeToFile:options:error: with NSDataWritingWithoutOverwriting
      // (0x1000000) is unavailable on older macOS, so use Foundation createFile:
      // guarded by the same existence check; never intentionally replace a file.
      const data = ns(content).dataUsingEncoding($.NSUTF8StringEncoding);
      const ok = manager.createFileAtPathContentsAttributes(ns(path), data, null);
      if (!ok) throw new Error("Foundation could not create Markdown: " + path);
    },
    ensureDirectory(path) {
      const ok = manager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
        ns(path), true, $.NSDictionary.dictionary, null
      );
      if (!ok) throw new Error("Foundation could not create directory: " + path);
    }
  };
}
