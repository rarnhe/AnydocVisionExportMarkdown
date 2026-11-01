var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/visionOcr.ts
var visionOcr_exports = {};
__export(visionOcr_exports, {
  NativeIO: () => NativeIO,
  isTraditionalChineseDominant: () => isTraditionalChineseDominant,
  performVisionOcr: () => performVisionOcr,
  processImageNode: () => processImageNode
});
module.exports = __toCommonJS(visionOcr_exports);
var SUPPORTED_EXTENSIONS = /* @__PURE__ */ new Set(["png", "jpg", "jpeg", "tiff", "bmp", "heic", "webp"]);
function isTraditionalChineseDominant(text) {
  if (!text) return false;
  const tradSample = /[繁體廣國會機關經濟進與實對學寶產關華區線點開]/g;
  const simpSample = /[简体广国会机关经济进与实对学宝产关华区线点开]/g;
  const tradMatches = (text.match(tradSample) || []).length;
  const simpMatches = (text.match(simpSample) || []).length;
  return tradMatches > simpMatches;
}
function performVisionOcr(filePath, targetLang) {
  if (typeof ObjC !== "undefined") {
    ObjC.import("Foundation");
    ObjC.import("AppKit");
    ObjC.import("Vision");
  } else {
    return "";
  }
  let VNRecognizeTextRequestClass = null;
  let VNImageRequestHandlerClass = null;
  if (typeof $ !== "undefined") {
    VNRecognizeTextRequestClass = $.VNRecognizeTextRequest;
    VNImageRequestHandlerClass = $.VNImageRequestHandler;
  }
  if (!VNRecognizeTextRequestClass && typeof ObjC !== "undefined" && ObjC.classes) {
    VNRecognizeTextRequestClass = ObjC.classes.VNRecognizeTextRequest;
    VNImageRequestHandlerClass = ObjC.classes.VNImageRequestHandler;
  }
  if (!VNRecognizeTextRequestClass || !VNImageRequestHandlerClass) {
    return "";
  }
  const fileURL = $.NSURL.fileURLWithPath($(filePath));
  const request = VNRecognizeTextRequestClass.alloc.init;
  request.setRecognitionLevel($.VNRequestTextRecognitionLevelAccurate);
  request.setUsesLanguageCorrection(true);
  request.setRevision(3);
  request.setMinimumTextHeight(0.01);
  request.setRecognitionLanguages($([targetLang]));
  const requestHandler = VNImageRequestHandlerClass.alloc.initWithURLOptions(
    fileURL,
    $({})
  );
  const error = Ref();
  const success = requestHandler.performRequestsError($([request]), error);
  if (!success) return "";
  const results = request.results;
  if (!results || results == $.nil) return "";
  const rawResults = results.js || results;
  const count = rawResults.length || (results.count ? results.count : 0);
  if (count === 0) return "";
  const fullTextLines = [];
  for (let i = 0; i < count; i++) {
    const observation = rawResults[i] || results.objectAtIndex && results.objectAtIndex(i);
    if (!observation || observation == $.nil) continue;
    const candidates = observation.topCandidates(1);
    if (!candidates || candidates == $.nil) continue;
    const topCandidate = candidates.js && candidates.js[0] || candidates.objectAtIndex && candidates.objectAtIndex(0);
    if (topCandidate && topCandidate != $.nil) {
      fullTextLines.push(topCandidate.string.js);
    }
  }
  return fullTextLines.join("\n");
}
async function processImageNode(rawPath) {
  if (false) {
    return null;
  }
  const fs = require("fs");
  const path = require("path");
  const { run: runJxa } = require("@jxa/run");
  const absPath = path.resolve(rawPath);
  if (!fs.existsSync(absPath)) return null;
  const ext = path.extname(absPath).slice(1).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) return null;
  let text = await runJxa(performVisionOcr, absPath, "zh-Hans");
  const isTraditional = isTraditionalChineseDominant(text);
  if (isTraditional) {
    text = await runJxa(
      (p) => performVisionOcr(p, "zh-Hant"),
      absPath
    );
  }
  const parsed = path.parse(absPath);
  const outName = isTraditional ? `${parsed.name}.zh-Hant.md` : `${parsed.name}.md`;
  const outPath = path.join(parsed.dir, outName);
  fs.writeFileSync(outPath, text, "utf-8");
  console.log(`[Node Success] Output: ${outPath}`);
  return outPath;
}
var NativeIO = {
  expandTildePath(p) {
    return $(p).stringByExpandingTildeInPath.stringByStandardizingPath.js;
  },
  isFileSync(p) {
    const fm = $.NSFileManager.defaultManager;
    const isDir = Ref();
    const exists = fm.fileExistsAtPathIsDirectory($(p), isDir);
    return exists && !isDir[0];
  },
  getExtension(filePath) {
    const ext = $(filePath).pathExtension.js;
    return typeof ext === "string" ? ext.toLowerCase() : "";
  },
  removeExtension(filePath) {
    return $(filePath).stringByDeletingPathExtension.js;
  },
  writeTextFileSync(outPath, content) {
    const nsText = $.NSString.stringWithString(content);
    const outURL = $.NSURL.fileURLWithPath($(outPath));
    const writeError = Ref();
    return nsText.writeToURLAtomicallyEncodingError(
      outURL,
      true,
      $.NSUTF8StringEncoding,
      writeError
    );
  }
};
if (false) {
  if (typeof ObjC !== "undefined") {
    ObjC.import("stdlib");
    ObjC.import("Foundation");
    ObjC.import("AppKit");
    ObjC.import("Vision");
  }
  globalThis.run = function(argv) {
    if (!argv || argv.length === 0) return "\u8BF7\u4F20\u5165\u56FE\u7247\u8DEF\u5F84";
    const results = [];
    for (const rawPath of argv) {
      const fullPath = NativeIO.expandTildePath(rawPath);
      if (!NativeIO.isFileSync(fullPath)) continue;
      const ext = NativeIO.getExtension(fullPath);
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
      let text = performVisionOcr(fullPath, "zh-Hans");
      const isTraditional = isTraditionalChineseDominant(text);
      if (isTraditional) {
        text = performVisionOcr(fullPath, "zh-Hant");
      }
      const basePath = NativeIO.removeExtension(fullPath);
      const outputPath = isTraditional ? `${basePath}.zh-Hant.md` : `${basePath}.md`;
      if (NativeIO.writeTextFileSync(outputPath, text)) {
        results.push(outputPath);
      }
    }
    return `JXA OCR \u5904\u7406\u5B8C\u6210: ${results.join(", ")}`;
  };
}
if (true) {
  const isDirectRun = typeof process !== "undefined" && process.argv[1]?.endsWith("visionOcr.node.js") || typeof process !== "undefined" && process.argv[1]?.endsWith("visionOcr.ts");
  if (isDirectRun) {
    const args = process.argv.slice(2);
    if (args.length > 0) {
      (async () => {
        for (const p of args) {
          await processImageNode(p);
        }
      })();
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  NativeIO,
  isTraditionalChineseDominant,
  performVisionOcr,
  processImageNode
});
