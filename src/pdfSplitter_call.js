// src/pdfSplitter.js

// ---------------------------------------------------------------------------
// 1. 日志与路径辅助工具
// ---------------------------------------------------------------------------

/**
 * 将任意路径转换为标准的绝对路径
 */
function toAbsolutePath(filePath) {
  const nsString = $(filePath).stringByExpandingTildeInPath;
  return $.NSURL.fileURLWithPath(nsString).path.js;
}

/**
 * 确保目标文件夹存在，若不存在则递归创建
 */
function ensureDirExists(dirPath) {
  const fm = $.NSFileManager.defaultManager;
  const isDir = Ref();
  const exists = fm.fileExistsAtPathIsDirectory(dirPath, isDir);
  if (!exists) {
    let error = Ref();
    const success = fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
      dirPath,
      true,
      $({}),
      error
    );
    if (!success) {
      throw new Error(`无法创建输出目录: ${dirPath}, 错误: ${error[0].localizedDescription.js}`);
    }
  }
}

/**
 * 将字符串写入指定路径
 */
function writeStringToFile(filePath, content) {
  const str = $.NSString.stringWithString(content);
  let error = Ref();
  const success = str.writeToFileAtomicallyEncodingError(
    filePath,
    true,
    $.NSUTF8StringEncoding,
    error
  );
  if (!success) {
    throw new Error(`无法写入文件 ${filePath}: ${error[0].localizedDescription.js}`);
  }
}

// ---------------------------------------------------------------------------
// 2. 对象解析逻辑 (Parse OCR Config)
// ---------------------------------------------------------------------------

/**
 * 解析 JS 对象字面量或 JSON 字符串，获取需 OCR 的页码集合 (Set)
 */
function parseOcrPages(inputStr) {
  const ocrPages = new Set();
  if (!inputStr) return ocrPages;

  let data = null;

  try {
    // 优先尝试直接标准的 JSON 解析
    data = JSON.parse(inputStr);
  } catch (e) {
    try {
      // 兼容 CLI 传入的 JS 对象字面量 (如 `{ code: 'needsOcr', pages: [12, 17] }`)
      data = Function(`"use strict"; return (${inputStr});`)();
    } catch (err) {
      throw new Error(`无法解析配置参数，请确认传入了有效的 JS 对象或 JSON 格式。\n接收内容: ${inputStr}`);
    }
  }

  if (data && Array.isArray(data.pages)) {
    for (const page of data.pages) {
      const p = Number(page);
      if (!isNaN(p)) {
        ocrPages.add(p);
      }
    }
  }

  return ocrPages;
}

// ---------------------------------------------------------------------------
// 3. 区间切分与 Task / Manifest 规划 (Chunk Planner)
// ---------------------------------------------------------------------------

/**
 * 构建任务切片序列及 Manifest 数据结构
 */
function planChunks(sourceFile, totalPages, ocrPages, outputDir) {
  const tasks = [];
  let taskId = 1;
  let currentPage = 1;

  // 提取单纯的源文件名（不含路径）
  const fileName = $(sourceFile).lastPathComponent.js;

  while (currentPage <= totalPages) {
    const chunkName = `chunk_${taskId}`;

    if (ocrPages.has(currentPage)) {
      // OCR 页：拆分为单页 PNG 任务
      const outputPath = `${outputDir}/${chunkName}.png`;
      tasks.push({
        id: taskId,
        type: "png",
        pages: [currentPage, currentPage],
        outputFileName: chunkName,
        outputPath: outputPath,
      });
      taskId++;
      currentPage++;
    } else {
      // 普通页：合并连续非 OCR 页为 PDF 任务
      const startPage = currentPage;
      while (currentPage <= totalPages && !ocrPages.has(currentPage)) {
        currentPage++;
      }
      const endPage = currentPage - 1;
      const outputPath = `${outputDir}/${chunkName}.pdf`;

      tasks.push({
        id: taskId,
        type: "pdf",
        pages: [startPage, endPage],
        outputFileName: chunkName,
        outputPath: outputPath,
      });
      taskId++;
    }
  }

  return {
    sourceFile: fileName,
    totalPages: totalPages,
    tasks: tasks,
  };
}

// ---------------------------------------------------------------------------
// 4. macOS 原生渲染与导出引擎 (JXA Engine)
// ---------------------------------------------------------------------------

/**
 * 截取导出 PDF 切片
 */
function exportPdfChunk(pdfDoc, startPage, endPage, outputPath) {
  const newDoc = $.PDFDocument.alloc.init;

  for (let p = startPage; p <= endPage; p++) {
    const pdfPage = pdfDoc.pageAtIndex(p - 1);
    if (!pdfPage) continue;
    newDoc.insertPageAtIndex(pdfPage, newDoc.pageCount);
  }

  const url = $.NSURL.fileURLWithPath(outputPath);
  const success = newDoc.writeToURL(url);
  if (!success) {
    throw new Error(`写入 PDF 失败: ${outputPath}`);
  }
}

/**
 * 栅格化单页 PDF 并导出为 PNG
 */
function exportPngChunk(pdfDoc, pageNum, outputPath, dpi) {
  const pdfPage = pdfDoc.pageAtIndex(pageNum - 1);
  if (!pdfPage) {
    throw new Error(`指定的页码超出范围: ${pageNum}`);
  }

  const backingScale = $.NSScreen.mainScreen ? $.NSScreen.mainScreen.backingScaleFactor : 2.0;
  const scaleFactor = dpi / (72.0 * backingScale);

  const pdfImageRep = $.NSPDFImageRep.imageRepWithData(pdfPage.dataRepresentation);
  const originalSize = pdfImageRep.bounds.size;
  const targetRect = $.NSMakeRect(0, 0, originalSize.width * scaleFactor, originalSize.height * scaleFactor);

  const image = $.NSImage.alloc.initWithSize(targetRect.size);

  image.lockFocus;
  $.NSColor.whiteColor.set;
  $.NSBezierPath.fillRect(targetRect);
  pdfImageRep.drawInRect(targetRect);
  image.unlockFocus;

  const tiffData = image.TIFFRepresentation;
  const bitmapRep = $.NSBitmapImageRep.imageRepWithData(tiffData);

  const pngData = bitmapRep.representationUsingTypeProperties(
    $.NSPNGFileType,
    $({})
  );

  const success = pngData.writeToFileAtomically(outputPath, true);
  if (!success) {
    throw new Error(`写入 PNG 失败: ${outputPath}`);
  }
}

// ---------------------------------------------------------------------------
// 5. PDF 拆分 API 入口
// ---------------------------------------------------------------------------

/**
 * 执行 PDF 拆分的核心 API 函数
 * @param {string} rawPdfPath - 源 PDF 文件路径
 * @param {string|object} ocrConfigInput - OCR 配置参数（对象或字符串）
 * @param {object} [options] - 可选配置选项 { outDir, dpi }
 * @returns {string} 输出目录绝对路径
 */
function splitPdfJXA(rawPdfPath, ocrConfigInput, options) {
  options = options || {};
  const dpi = options.dpi || 200;

  // 1. 规范化路径与初始化 PDFDocument
  const pdfPath = toAbsolutePath(rawPdfPath);
  const pdfUrl = $.NSURL.fileURLWithPath(pdfPath);
  const pdfDoc = $.PDFDocument.alloc.initWithURL(pdfUrl);

  if (!pdfDoc) {
    throw new Error(`无法打开 PDF 文件 ${pdfPath}`);
  }

  const totalPages = pdfDoc.pageCount;

  // 2. 确定输出目录路径
  let outputDir = "";
  if (options.outDir) {
    outputDir = toAbsolutePath(options.outDir);
  } else {
    outputDir = $(pdfPath).stringByDeletingPathExtension.js;
  }

  ensureDirExists(outputDir);

  // 3. 解析需要 OCR 的页码
  const ocrConfigString = typeof ocrConfigInput === "string" 
    ? ocrConfigInput 
    : JSON.stringify(ocrConfigInput);
  const ocrPages = parseOcrPages(ocrConfigString);

  // 4. 构建任务与 Manifest 数据
  const manifest = planChunks(pdfPath, totalPages, ocrPages, outputDir);

  // 5. 导出文件 (PDF & PNG)
  for (const task of manifest.tasks) {
    if (task.type === "pdf") {
      exportPdfChunk(pdfDoc, task.pages[0], task.pages[1], task.outputPath);
    } else if (task.type === "png") {
      exportPngChunk(pdfDoc, task.pages[0], task.outputPath, dpi);
    }
  }

  // 6. 整理导出给 json 的数据，剔除内部使用的临时变量 (outputPath)
  const exportManifest = {
    sourceFile: manifest.sourceFile,
    totalPages: manifest.totalPages,
    tasks: manifest.tasks.map((task) => ({
      id: task.id,
      type: task.type,
      pages: task.pages,
      outputFileName: task.outputFileName,
    })),
  };

  const manifestPath = `${outputDir}/manifest.json`;
  const manifestJsonStr = JSON.stringify(exportManifest, null, 2);
  writeStringToFile(manifestPath, manifestJsonStr);

  return outputDir;
}

// ---------------------------------------------------------------------------
// 6. 模块导出适配层 (支持 ES Import, CommonJS 以及 JXA 全局挂载)
// ---------------------------------------------------------------------------

if (typeof globalThis !== "undefined") {
  globalThis.splitPdfJXA = splitPdfJXA;
  globalThis.parseOcrPages = parseOcrPages;
  globalThis.planChunks = planChunks;
  globalThis.toAbsolutePath = toAbsolutePath;
} else if (typeof this !== "undefined") {
  this.splitPdfJXA = splitPdfJXA;
  this.parseOcrPages = parseOcrPages;
  this.planChunks = planChunks;
  this.toAbsolutePath = toAbsolutePath;
}