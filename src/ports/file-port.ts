/** Host-neutral filesystem contract; no Node or Objective-C dependencies. */
export type EntryKind = "file" | "directory" | "symlink" | "other";
export interface FileEntry { name: string; kind: EntryKind; }
export interface FilePort {
  stat(path: string): EntryKind | "missing";
  listEntries(path: string): FileEntry[];
  readBytes(path: string): Uint8Array;
  writeText(path: string, content: string): void;
  ensureDirectory(path: string): void;
}
