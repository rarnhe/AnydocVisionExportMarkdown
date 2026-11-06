import { decodeBase64 } from "../shared/base64";
import type { FilePort } from "../ports/file-port";

declare const ObjC: any;
declare const $: any;

/** Foundation-only file system bridge; no NSTask, Apple Events, or JSC subprocess. */
function ns(value: string): any {
  return $.NSString.stringWithString(String(value));
}

export function createCocoaFilePort(): FilePort {
  if (typeof ObjC === "undefined") throw new Error("JXA Objective-C bridge unavailable");
  ObjC.import("Foundation");
  const fm = $.NSFileManager.defaultManager;
  return {
    readBytes(path: string): Uint8Array {
      const data = $.NSData.dataWithContentsOfFile(ns(path));
      if (!data || Number(data.length) < 5) throw new Error("Missing/empty PDF: " + path);
      // NSData is the only binary source; Base64 crosses the ObjC->JS bridge without byte truncation.
      const base64 = ObjC.unwrap(data.base64EncodedStringWithOptions(0));
      if (typeof base64 !== "string") throw new Error("NSData Base64 bridge returned non-string");
      return decodeBase64(base64);
    },
    writeText(path: string, content: string): void {
      const ok = ns(content).writeToFileAtomicallyEncodingError(
        ns(path), true, $.NSUTF8StringEncoding, null
      );
      if (!ok) throw new Error("Foundation could not write " + path);
    },
    ensureDirectory(path: string): void {
      const ok = fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
        ns(path), true, $.NSDictionary.dictionary, null
      );
      if (!ok) throw new Error("Foundation could not create directory " + path);
    }
  };
}
