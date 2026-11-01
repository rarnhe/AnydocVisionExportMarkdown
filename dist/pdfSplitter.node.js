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

// src/pdfSplitter.ts
var pdfSplitter_exports = {};
__export(pdfSplitter_exports, {
  executePdfSplitInJxa: () => executePdfSplitInJxa,
  parseCliArgs: () => parseCliArgs,
  processPdfSplitNode: () => processPdfSplitNode
});
module.exports = __toCommonJS(pdfSplitter_exports);
function executePdfSplitInJxa(rawPdfPath, ocrConfigString, outDirOption, dpi) {
  if (typeof globalThis.__name === "undefined") {
    globalThis.__name = (fn) => fn;
  }
  if (typeof ObjC !== "undefined") {
    ObjC.import("Foundation");
    ObjC.import("AppKit");
    ObjC.import("PDFKit");
  } else {
    return { success: false, error: "\u975E JXA \u8FD0\u884C\u73AF\u5883" };
  }
  try {
    const expandPath = (p) => $(p).stringByExpandingTildeInPath.js;
    const pdfPath = expandPath(rawPdfPath);
    const pdfUrl = $.NSURL.fileURLWithPath($(pdfPath));
    const pdfDoc = $.PDFDocument.alloc.initWithURL(pdfUrl);
    if (!pdfDoc) {
      return { success: false, error: `\u65E0\u6CD5\u6253\u5F00 PDF \u6587\u4EF6: ${pdfPath}` };
    }
    const totalPages = pdfDoc.pageCount;
    const outputDir = outDirOption ? expandPath(outDirOption) : $(pdfPath).stringByDeletingPathExtension.js;
    const fm = $.NSFileManager.defaultManager;
    const isDir = Ref();
    if (!fm.fileExistsAtPathIsDirectory($(outputDir), isDir)) {
      const createErr = Ref();
      const created = fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
        $(outputDir),
        true,
        $({}),
        createErr
      );
      if (!created) {
        return {
          success: false,
          error: `\u65E0\u6CD5\u521B\u5EFA\u76EE\u5F55: ${outputDir}, \u539F\u56E0: ${createErr[0]?.localizedDescription?.js || "\u672A\u77E5\u9519\u8BEF"}`
        };
      }
    }
    const ocrPages = /* @__PURE__ */ new Set();
    if (ocrConfigString) {
      let data = null;
      try {
        data = JSON.parse(ocrConfigString);
      } catch (e) {
        try {
          data = Function(`"use strict"; return (${ocrConfigString});`)();
        } catch (err) {
        }
      }
      if (data && Array.isArray(data.pages)) {
        for (const page of data.pages) {
          const p = Number(page);
          if (!isNaN(p)) ocrPages.add(p);
        }
      }
    }
    const tasks = [];
    let taskId = 1;
    let currentPage = 1;
    while (currentPage <= totalPages) {
      const chunkName = `chunk_${taskId}`;
      if (ocrPages.has(currentPage)) {
        tasks.push({
          id: taskId,
          type: "png",
          pages: [currentPage, currentPage],
          outputFileName: chunkName,
          outputPath: `${outputDir}/${chunkName}.png`
        });
        taskId++;
        currentPage++;
      } else {
        const startPage = currentPage;
        while (currentPage <= totalPages && !ocrPages.has(currentPage)) {
          currentPage++;
        }
        const endPage = currentPage - 1;
        tasks.push({
          id: taskId,
          type: "pdf",
          pages: [startPage, endPage],
          outputFileName: chunkName,
          outputPath: `${outputDir}/${chunkName}.pdf`
        });
        taskId++;
      }
    }
    const backingScale = $.NSScreen.mainScreen ? $.NSScreen.mainScreen.backingScaleFactor : 2;
    const scaleFactor = dpi / (72 * backingScale);
    for (const task of tasks) {
      if (task.type === "pdf") {
        const newDoc = $.PDFDocument.alloc.init;
        for (let p = task.pages[0]; p <= task.pages[1]; p++) {
          const pdfPage = pdfDoc.pageAtIndex(p - 1);
          if (pdfPage) newDoc.insertPageAtIndex(pdfPage, newDoc.pageCount);
        }
        const url = $.NSURL.fileURLWithPath($(task.outputPath));
        newDoc.writeToURL(url);
      } else if (task.type === "png") {
        const pdfPage = pdfDoc.pageAtIndex(task.pages[0] - 1);
        if (pdfPage) {
          const pdfImageRep = $.NSPDFImageRep.imageRepWithData(pdfPage.dataRepresentation);
          const originalSize = pdfImageRep.bounds.size;
          const targetRect = $.NSMakeRect(
            0,
            0,
            originalSize.width * scaleFactor,
            originalSize.height * scaleFactor
          );
          const image = $.NSImage.alloc.initWithSize(targetRect.size);
          image.lockFocus;
          $.NSColor.whiteColor.set;
          $.NSBezierPath.fillRect(targetRect);
          pdfImageRep.drawInRect(targetRect);
          image.unlockFocus;
          const tiffData = image.TIFFRepresentation;
          const bitmapRep = $.NSBitmapImageRep.imageRepWithData(tiffData);
          const pngData = bitmapRep.representationUsingTypeProperties($.NSPNGFileType, $({}));
          pngData.writeToFileAtomically($(task.outputPath), true);
        }
      }
    }
    const manifestPath = `${outputDir}/manifest.json`;
    const exportManifest = {
      sourceFile: $(pdfPath).lastPathComponent.js,
      totalPages,
      tasks: tasks.map((t) => ({
        id: t.id,
        type: t.type,
        pages: t.pages,
        outputFileName: t.outputFileName
      }))
    };
    const str = $.NSString.stringWithString(JSON.stringify(exportManifest, null, 2));
    const writeErr = Ref();
    str.writeToFileAtomicallyEncodingError(
      $(manifestPath),
      true,
      $.NSUTF8StringEncoding,
      writeErr
    );
    return { success: true, outputDir };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}
function parseCliArgs(rawArgs) {
  let positional = [];
  let outDir = null;
  let dpi = 200;
  let i = 0;
  while (i < rawArgs.length) {
    const arg = rawArgs[i];
    if (arg === "-h" || arg === "--help") {
      return { pdfPath: "", ocrConfig: "", outDir: null, dpi: 200, showHelp: true };
    } else if (arg === "--out-dir") {
      if (!rawArgs[i + 1])
        return { pdfPath: "", ocrConfig: "", outDir: null, dpi: 200, showHelp: false, error: "--out-dir \u7F3A\u5C11\u503C" };
      outDir = rawArgs[i + 1];
      i++;
    } else if (arg === "--dpi") {
      if (!rawArgs[i + 1])
        return { pdfPath: "", ocrConfig: "", outDir: null, dpi: 200, showHelp: false, error: "--dpi \u7F3A\u5C11\u503C" };
      dpi = parseInt(rawArgs[i + 1], 10) || 200;
      i++;
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
    i++;
  }
  if (positional.length < 2) {
    return {
      pdfPath: "",
      ocrConfig: "",
      outDir: null,
      dpi: 200,
      showHelp: false,
      error: "\u53C2\u6570\u4E0D\u8DB3\uFF0C\u9700\u8981\u63D0\u4F9B PDF \u6587\u4EF6\u8DEF\u5F84\u4E0E OCR \u914D\u7F6E\u5BF9\u8C61"
    };
  }
  return { pdfPath: positional[0], ocrConfig: positional[1], outDir, dpi, showHelp: false };
}
function showHelpText() {
  console.log(`\u7528\u6CD5: pdfSplitter <pdfFilePath> <ocrConfigObject> [\u9009\u9879]
\u9009\u9879:
  -h, --help       \u663E\u793A\u5E2E\u52A9\u4FE1\u606F
  --out-dir <DIR>  \u8BBE\u7F6E\u8F93\u51FA\u76EE\u5F55 (\u9ED8\u8BA4: \u4E0E PDF \u540C\u7EA7\u7684\u540C\u540D\u6587\u4EF6\u5939)
  --dpi <VALUE>    \u8BBE\u7F6E PNG \u6E32\u67D3 DPI (\u9ED8\u8BA4: 200)`);
}
async function processPdfSplitNode(rawArgs) {
  if (false) {
    return false;
  }
  const { run: runJxa } = require("@jxa/run");
  const parsed = parseCliArgs(rawArgs);
  if (parsed.showHelp) {
    showHelpText();
    return true;
  }
  if (parsed.error) {
    console.error(`\u9519\u8BEF: ${parsed.error}`);
    showHelpText();
    return false;
  }
  const result = await runJxa(
    executePdfSplitInJxa,
    parsed.pdfPath,
    parsed.ocrConfig,
    parsed.outDir,
    parsed.dpi
  );
  if (result.success) {
    console.log(`[Node Success] \u5207\u5206\u6210\u529F\uFF01\u6587\u4EF6\u8F93\u51FA\u81F3: ${result.outputDir}`);
    return true;
  } else {
    console.error(`[Node Error] \u6267\u884C\u5931\u8D25: ${result.error}`);
    return false;
  }
}
if (false) {
  const getJxaArgs = () => {
    const argsObj = $.NSProcessInfo.processInfo.arguments;
    const count = argsObj.count;
    const allArgs = [];
    for (let i = 0; i < count; i++) {
      allArgs.push(argsObj.objectAtIndex(i).js);
    }
    const dashDashIndex = allArgs.indexOf("--");
    if (dashDashIndex !== -1) return allArgs.slice(dashDashIndex + 1);
    return allArgs.length > 3 ? allArgs.slice(3) : [];
  };
  const rawJxaArgs = getJxaArgs();
  const scriptArgs = rawJxaArgs.length > 0 ? rawJxaArgs.slice(1) : [];
  const parsed = parseCliArgs(scriptArgs);
  if (parsed.showHelp) {
    showHelpText();
  } else if (parsed.error) {
    console.error(`\u9519\u8BEF: ${parsed.error}`);
  } else {
    const res = executePdfSplitInJxa(
      parsed.pdfPath,
      parsed.ocrConfig,
      parsed.outDir,
      parsed.dpi
    );
    if (res.success) {
      console.log(`[JXA Success] \u5207\u5206\u6210\u529F\uFF01\u6587\u4EF6\u8F93\u51FA\u81F3: ${res.outputDir}`);
    } else {
      console.error(`[JXA Error] \u6267\u884C\u5931\u8D25: ${res.error}`);
    }
  }
}
if (true) {
  if (typeof process !== "undefined" && process.argv) {
    const isDirectRun = process.argv[1]?.endsWith("pdfSplitter.node.js") || process.argv[1]?.endsWith("pdfSplitter.ts");
    if (isDirectRun) {
      const args = process.argv.slice(2);
      processPdfSplitNode(args);
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  executePdfSplitInJxa,
  parseCliArgs,
  processPdfSplitNode
});
