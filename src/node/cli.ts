import { convertBatch } from "../core/batch";
import { loadPackageAssets } from "./package-assets";
import { createNodeFilePort } from "./node-fs";

/** Developer baseline, running under Node via npx tsx; same AnyDoc engine as JXA. */
try {
  const args = process.argv.slice(2);
  const result = convertBatch(args, createNodeFilePort(), loadPackageAssets(), "Node");
  console.log("ANYDOC_BATCH_JSON=" + JSON.stringify(result));
} catch (error) {
  console.error("Node AnyDoc conversion failed:", error);
  process.exitCode = 1;
}
