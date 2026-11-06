import { processInputs } from "../core/processor";
import { loadPackageAssets } from "./node-assets";
import { createNodeFilePort } from "../adapters/node-fs";

/** Developer baseline, running under Node via npx tsx; same AnyDoc engine as JXA. */
try {
  const args = process.argv.slice(2);
  const result = processInputs(args, createNodeFilePort(), loadPackageAssets(), "Node");
  console.log("ANYDOC_BATCH_JSON=" + JSON.stringify(result));
  if (result.failureCount) process.exitCode = 1;
} catch (error) {
  console.error("Node AnyDoc conversion failed:", error);
  process.exitCode = 1;
}
