import type { AnyDocAssets } from "../core/engine";
// Node-only CommonJS helper. Kept outside src/ so it cannot enter the JXA bundle.
const {loadPackageAssets: loadAssets} = require("../../tools/wasm-assets.cjs") as {
  loadPackageAssets: () => AnyDocAssets;
};
export function loadPackageAssets(): AnyDocAssets {
  return loadAssets();
}
