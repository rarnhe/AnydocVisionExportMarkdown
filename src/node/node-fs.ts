import * as fs from "node:fs";
import type { FilePort } from "../core/batch";

export function createNodeFilePort(): FilePort {
  return {
    readBytes(path: string): Uint8Array {
      return new Uint8Array(fs.readFileSync(path));
    },
    writeText(path: string, content: string): void {
      fs.writeFileSync(path, content, "utf8");
    },
    ensureDirectory(path: string): void {
      fs.mkdirSync(path, {recursive: true});
    }
  };
}
