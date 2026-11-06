import * as fs from "node:fs";
import type { FilePort, EntryKind } from "../ports/file-port";
function kind(s: fs.Stats): EntryKind {
  return s.isSymbolicLink() ? "symlink" : s.isDirectory() ? "directory" : s.isFile() ? "file" : "other";
}
export function createNodeFilePort(): FilePort {
  return {
    stat(path) {
      try { return kind(fs.lstatSync(path)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing"; throw error; }
    },
    listEntries(path) {
      return fs.readdirSync(path, {withFileTypes: true}).map(e => ({
        name: e.name, kind: e.isSymbolicLink() ? "symlink" : e.isDirectory() ? "directory" : e.isFile() ? "file" : "other"
      }));
    },
    readBytes(path) { return new Uint8Array(fs.readFileSync(path)); },
    writeText(path, content) { fs.writeFileSync(path, content, "utf8"); },
    ensureDirectory(path) { fs.mkdirSync(path, {recursive: true}); }
  };
}
