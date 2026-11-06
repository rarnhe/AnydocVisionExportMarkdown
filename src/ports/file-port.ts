/** Host-neutral filesystem contract. No Node or Objective-C dependencies. */
export interface FilePort {
  readBytes(path: string): Uint8Array;
  writeText(path: string, content: string): void;
  ensureDirectory(path: string): void;
}
