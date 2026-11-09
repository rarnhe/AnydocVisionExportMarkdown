// ============================================================================
// 1. 类型与环境初始化
// ============================================================================
import init, { toMarkdownBytes } from '../node_modules/@firecrawl/anydoc-wasm/anydoc_wasm.js';

declare global {
  var ObjC: any;
  var $: any;
  var Ref: any;
  var IS_JXA_BUILD: boolean | undefined;
}

declare const require: any;
declare const process: any;

if (typeof ObjC !== 'undefined') {
  try {
    ObjC.import('Foundation');
    ObjC.import('AppKit');
    ObjC.import('PDFKit');
    ObjC.import('Vision');
  } catch (e) {}
}

function safeLog(...args: any[]) {
  const message = args
    .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
    .join(' ');
  if (typeof process !== 'undefined' && process.stdout) {
    console.log(message);
  } else if (typeof $!== 'undefined' &&$.NSFileHandle) {
    const str = $.NSString.stringWithString(message + '\n');
    const data = str.dataUsingEncoding($.NSUTF8StringEncoding);
    $.NSFileHandle.fileHandleWithStandardOutput.writeData(data);
  } else {
    console.log(message);
  }
}

interface TaskItem {
  id: number;
  type: 'pdf' | 'png';
  pages: [number, number];
  outputFileName: string;
}

interface Manifest {
  sourceFile: string;
  totalPages: number;
  tasks: TaskItem[];
}

// ============================================================================
// 2. 跨平台文件系统与系统工具
// ============================================================================
const sys = {
  isNode(): boolean {
    return (
      typeof process !== 'undefined' &&
      process.versions &&
      !!process.versions.node &&
      (typeof IS_JXA_BUILD === 'undefined' || !IS_JXA_BUILD)
    );
  },
  resolvePath(...paths: string[]): string {
    if (this.isNode()) return require('path').resolve(...paths);
    return String($(paths.join('/')).stringByStandardizingPath.js);
  },
  dirname(p: string): string {
    if (this.isNode()) return require('path').dirname(p);
    return String($(p).stringByDeletingLastPathComponent.js);
  },
  basename(p: string): string {
    if (this.isNode()) return require('path').basename(p);
    return String($(p).lastPathComponent.js);
  },
  fileExists(p: string): boolean {
    if (this.isNode()) return require('fs').existsSync(p);
    return Boolean($.NSFileManager.defaultManager.fileExistsAtPath($(p)));
  },
  readFileBuffer(p: string): Uint8Array {
    if (this.isNode()) return new Uint8Array(require('fs').readFileSync(p));
    const data = $.NSData.dataWithContentsOfFile($(p));
    if (!data || data == $.nil) throw new Error(`无法读取文件: ${p}`);
    const buf = new Uint8Array(Number(data.length));
    data.getBytesLength(buf, buf.length);
    return buf;
  },
  readFileText(p: string): string {
    if (this.isNode()) return require('fs').readFileSync(p, 'utf-8');
    const nsStr = $.NSString.stringWithContentsOfFileEncodingError($(p),$.NSUTF8StringEncoding, Ref());
    return String(nsStr.js);
  },
  writeFileText(p: string, content: string): void {
    if (this.isNode()) {
      require('fs').writeFileSync(p, content, 'utf-8');
      return;
    }
    $.NSString.stringWithString(content || '').writeToFileAtomicallyEncodingError(
      $(p),
      true,
      $.NSUTF8StringEncoding,
      Ref()
    );
  },
  removeDirRecursively(p: string): void {
    if (this.isNode()) {
      require('fs').rmSync(p, { recursive: true, force: true });
      return;
    }
    $.NSFileManager.defaultManager.removeItemAtPathError($(p), Ref());
  },
  getFileSize(p: string): number {
    if (this.isNode()) return require('fs').statSync(p).size;
    const attrs = $.NSFileManager.defaultManager.attributesOfItemAtPathError($(p), Ref());
    return Number(attrs.objectForKey($.NSFileSize));
  },
};

// ============================================================================
// 3. JXA 原生 PDF 切分核心引擎 (无外部变量依赖，完全独立闭包)
// ============================================================================
export function executePdfSplitInJxa(
  rawPdfPath: string,
  ocrConfigString: string,
  outDirOption: string | null,
  dpi: number
): { success: boolean; outputDir?: string; error?: string } {
  if (typeof ObjC !== 'undefined') {
    try {
      ObjC.import('Foundation');
      ObjC.import('AppKit');
      ObjC.import('PDFKit');
      ObjC.import('Vision');
    } catch (e) {}
  } else {
    return { success: false, error: '非 JXA 运行环境' };
  }

  try {
    const expandPath = (p: string) => $(p).stringByExpandingTildeInPath.js;
    const pdfPath = expandPath(rawPdfPath);
    const pdfUrl = $.NSURL.fileURLWithPath($(pdfPath));
    const pdfDoc = $.PDFDocument.alloc.initWithURL(pdfUrl);

    if (!pdfDoc || pdfDoc == $.nil) return { success: false, error: `无法打开 PDF: ${pdfPath}` };

    const totalPages = Number(pdfDoc.pageCount);
    const outputDir = outDirOption ? expandPath(outDirOption) : String($(pdfPath).stringByDeletingPathExtension.js);
    const fm = $.NSFileManager.defaultManager;

    if (!fm.fileExistsAtPathIsDirectory($(outputDir), Ref())) {
      fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError($(outputDir), true,$({}), Ref());
    }

    const ocrPages = new Set<number>();
    if (ocrConfigString) {
      try {
        const data = JSON.parse(ocrConfigString);
        if (data && Array.isArray(data.pages)) {
          data.pages.forEach((p: any) => ocrPages.add(Number(p)));
        }
      } catch (e) {}
    }

    interface LocalTaskItem {
      id: number;
      type: 'pdf' | 'png';
      pages: [number, number];
      outputFileName: string;
    }

    const tasks: LocalTaskItem[] = [];
    let taskId = 1;
    let currentPage = 1;

    while (currentPage <= totalPages) {
      const chunkName = `chunk_${taskId}`;
      if (ocrPages.has(currentPage)) {
        tasks.push({ id: taskId, type: 'png', pages: [currentPage, currentPage], outputFileName: chunkName });
        taskId++;
        currentPage++;
      } else {
        const startPage = currentPage;
        while (currentPage <= totalPages && !ocrPages.has(currentPage)) currentPage++;
        tasks.push({ id: taskId, type: 'pdf', pages: [startPage, currentPage - 1], outputFileName: chunkName });
        taskId++;
      }
    }

    const scaleFactor = dpi / 72.0;

    for (const task of tasks) {
      const outPath = `${outputDir}/${task.outputFileName}.${task.type}`;
      if (task.type === 'pdf') {
        const newDoc = $.PDFDocument.alloc.init;
        for (let p = task.pages[0]; p <= task.pages[1]; p++) {
          const page = pdfDoc.pageAtIndex(p - 1);
          if (page && page != $.nil) newDoc.insertPageAtIndex(page, newDoc.pageCount);
        }
        newDoc.writeToURL($.NSURL.fileURLWithPath($(outPath)));
      } else {
        const pdfPage = pdfDoc.pageAtIndex(task.pages[0] - 1);
        if (pdfPage && pdfPage != $.nil) {
          const pdfImageRep = $.NSPDFImageRep.imageRepWithData(pdfPage.dataRepresentation);
          const origSize = pdfImageRep.bounds.size;
          const pw = Math.round(origSize.width * scaleFactor);
          const ph = Math.round(origSize.height * scaleFactor);
          const bitmapRep =
            $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
              $.nil,
              pw,
              ph,
              8,
              4,
              true,
              false,
              $.NSCalibratedRGBColorSpace,
              0,
              32
            );
          const ctx = $.NSGraphicsContext.graphicsContextWithBitmapImageRep(bitmapRep);
          $.NSGraphicsContext.saveGraphicsState;
          $.NSGraphicsContext.setCurrentContext(ctx);
          ctx.setImageInterpolation($.NSImageInterpolationHigh);
          const rect = $.NSMakeRect(0, 0, pw, ph);
          $.NSColor.whiteColor.set;
          $.NSBezierPath.fillRect(rect);
          pdfImageRep.drawInRect(rect);
          $.NSGraphicsContext.restoreGraphicsState;
          const pngData = bitmapRep.representationUsingTypeProperties($.NSPNGFileType, $({}));
          pngData.writeToFileAtomically($(outPath), true);
        }
      }
    }

    const manifest = {
      sourceFile: String($(pdfPath).lastPathComponent.js),
      totalPages,
      tasks,
    };
    const manifestJson = JSON.stringify(manifest, null, 2);
    $.NSString.stringWithString(manifestJson).writeToFileAtomicallyEncodingError(
      $(`${outputDir}/manifest.json`),
      true,
      $.NSUTF8StringEncoding,
      Ref()
    );

    return { success: true, outputDir };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

// ============================================================================
// 4. Apple Vision OCR 执行内核 (无外部变量依赖，完全独立闭包)
// ============================================================================
export function performVisionOcrInJxa(imagePath: string, targetLang: 'zh-Hans' | 'zh-Hant'): string {
  if (typeof ObjC !== 'undefined') {
    try {
      ObjC.import('Foundation');
      ObjC.import('AppKit');
      ObjC.import('Vision');
    } catch (e) {}
  } else {
    return '';
  }

  const fileURL = $.NSURL.fileURLWithPath($(imagePath));
  const request = $.VNRecognizeTextRequest.alloc.init;
  request.setRecognitionLevel($.VNRequestTextRecognitionLevelAccurate);
  request.setUsesLanguageCorrection(true);
  request.setRecognitionLanguages($([targetLang]));

  const handler = $.VNImageRequestHandler.alloc.initWithURLOptions(fileURL, $({}));
  const error = Ref();
  if (!handler.performRequestsError($([request]), error)) return '';

  const results = request.results;
  if (!results || results == $.nil) return '';

  const rawResults = results.js || results;
  const count = rawResults.length || (results.count ? Number(results.count) : 0);
  const lines: string[] = [];

  for (let i = 0; i < count; i++) {
    const obs = rawResults[i] || (results.objectAtIndex && results.objectAtIndex(i));
    if (!obs || obs == $.nil) continue;

    const candidates = obs.topCandidates(1);
    if (!candidates || candidates == $.nil) continue;

    const top = (candidates.js && candidates.js[0]) || (candidates.objectAtIndex && candidates.objectAtIndex(0));
    if (top && top != $.nil) lines.push(String(top.string.js));
  }

  return lines.join('\n');
}

function extractOcrConfigFromErrorPayload(err: any): string {
  if (!err) return '';
  if (Array.isArray(err.pages) && err.pages.length > 0) return JSON.stringify({ pages: err.pages });
  const errStr = typeof err === 'string' ? err : err.message || String(err);
  const first = errStr.indexOf('{');
  const last = errStr.lastIndexOf('}');
  return first !== -1 && last > first ? errStr.substring(first, last + 1) : '';
}

// 安全解码：通过 globalThis 挂载的 TextDecoder 解码，彻底规避 ReferenceError & 构造参数检查
function decodeMarkdownResult(rawRes: any): string {
  if (!rawRes) return '';
  if (typeof rawRes === 'string') return rawRes;
  const safeBytes = rawRes instanceof Uint8Array ? rawRes : new Uint8Array(rawRes.buffer || rawRes);

  const DecoderClass = (globalThis as any).TextDecoder;
  if (DecoderClass) {
    try {
      return new DecoderClass('utf-8').decode(safeBytes);
    } catch (e) {
      return new DecoderClass().decode(safeBytes);
    }
  }

  return String.fromCharCode.apply(null, Array.from(safeBytes));
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ============================================================================
// 5. 核心处理流程
// ============================================================================
export async function processAndExportDocument(inputFilePath: string) {
  if (!inputFilePath) throw new Error('未指定输入 PDF 文件路径');

  const absInputPath = sys.resolvePath(inputFilePath);
  const inputDir = sys.dirname(absInputPath);
  const baseName = sys.basename(absInputPath);
  const docName = baseName.lastIndexOf('.') > 0 ? baseName.substring(0, baseName.lastIndexOf('.')) : baseName;
  const finalMdPath = sys.resolvePath(inputDir, `${docName}.md`);
  const workDir = sys.resolvePath(inputDir, docName);

  if (sys.fileExists(finalMdPath)) {
    safeLog(`⏩ 已存在导出文件: ${finalMdPath} (${formatFileSize(sys.getFileSize(finalMdPath))})，跳过处理。`);
    return;
  }

  safeLog(`🚀 开始解析文档: ${absInputPath}`);

  // WASM 模块初始化
  if (sys.isNode()) {
    const wasmPath = require.resolve('@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm');
    await init({ module_or_path: sys.readFileBuffer(wasmPath) });
  } else {
    const jxaScriptPath = String($.NSProcessInfo.processInfo.arguments.objectAtIndex(1).js);
    const scriptDir = sys.dirname(jxaScriptPath);
    let wasmPath = sys.resolvePath(scriptDir, 'anydoc_wasm_bg.wasm');
    if (!sys.fileExists(wasmPath)) {
      wasmPath = sys.resolvePath(scriptDir, '../node_modules/@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm');
    }
    await init({ module_or_path: sys.readFileBuffer(wasmPath).buffer });
  }

  const inputBuffer = sys.readFileBuffer(absInputPath);
  let directMarkdown = '';
  let needsSplit = false;
  let ocrConfigJson = '';

  try {
    safeLog(`🔍 执行 WASM 预检测...`);
    directMarkdown = decodeMarkdownResult(toMarkdownBytes(inputBuffer));
  } catch (err: any) {
    needsSplit = true;
    ocrConfigJson = extractOcrConfigFromErrorPayload(err);
    safeLog(`⚠️ 包含扫描页/需分切处理，提取配置 JSON: ${ocrConfigJson || '(空)'}`);
  }

  if (!needsSplit) {
    sys.writeFileText(finalMdPath, directMarkdown);
    safeLog(`\n🎉 电子版 PDF 转换完成！保存至: ${finalMdPath}`);
    return;
  }

  safeLog(`✂️ 启动 PDF 页面分切引擎...`);
  let splitResult: { success: boolean; outputDir?: string; error?: string };

  if (sys.isNode()) {
    const { run: runJxa } = require('@jxa/run');
    try {
      splitResult = await runJxa(
        (pdfPath: string, jsonConfig: string, targetDir: string, dpiVal: number, code: string) => {
          try {
            if (typeof (globalThis as any).__name === 'undefined') {
              (globalThis as any).__name = (fn: any) => fn;
            }
            const execFn = new Function('return (' + code + ')')();
            return execFn(pdfPath, jsonConfig, targetDir, dpiVal);
          } catch (err: any) {
            return {
              success: false,
              error: '[JXA Bridge Split Error] ' + (err ? err.message || String(err) : '未知错误'),
            };
          }
        },
        absInputPath,
        ocrConfigJson,
        workDir,
        200,
        executePdfSplitInJxa.toString()
      );
    } catch (err: any) {
      splitResult = { success: false, error: err?.message || String(err) };
    }
  } else {
    splitResult = executePdfSplitInJxa(absInputPath, ocrConfigJson, workDir, 200);
  }

  if (!splitResult.success) {
    safeLog(`❌ PDF 分切失败: ${splitResult.error}`);
    if (sys.isNode()) process.exit(1);
    return;
  }

  const manifestPath = sys.resolvePath(workDir, 'manifest.json');
  if (!sys.fileExists(manifestPath)) {
    safeLog(`❌ 未找到清单文件: ${manifestPath}`);
    if (sys.isNode()) process.exit(1);
    return;
  }

  const manifest: Manifest = JSON.parse(sys.readFileText(manifestPath));
  safeLog(`📋 包含 ${manifest.tasks.length} 个分块任务，开始逐块 OCR / 解析...`);

  for (const task of manifest.tasks) {
    const chunkFileName = `${task.outputFileName}.${task.type}`;
    const chunkFilePath = sys.resolvePath(workDir, chunkFileName);
    const standardMdPath = sys.resolvePath(workDir, `${task.outputFileName}.md`);

    if (task.type === 'pdf') {
      safeLog(`  [Chunk ${task.id}/${manifest.tasks.length}] 解析电子页: ${chunkFileName}`);
      const pdfBuffer = sys.readFileBuffer(chunkFilePath);
      const mdContent = decodeMarkdownResult(toMarkdownBytes(pdfBuffer));
      sys.writeFileText(standardMdPath, mdContent);
    } else {
      safeLog(`  [Chunk ${task.id}/${manifest.tasks.length}] Apple Vision OCR 解析扫描页: ${chunkFileName}`);
      let ocrText = '';
      if (sys.isNode()) {
        const { run: runJxa } = require('@jxa/run');
        try {
          ocrText = await runJxa(
            (imgPath: string, lang: string, code: string) => {
              try {
                if (typeof (globalThis as any).__name === 'undefined') {
                  (globalThis as any).__name = (fn: any) => fn;
                }
                const execFn = new Function('return (' + code + ')')();
                return execFn(imgPath, lang);
              } catch (err: any) {
                return '';
              }
            },
            chunkFilePath,
            'zh-Hans',
            performVisionOcrInJxa.toString()
          );
        } catch (e) {
          ocrText = '';
        }
      } else {
        ocrText = performVisionOcrInJxa(chunkFilePath, 'zh-Hans');
      }
      sys.writeFileText(standardMdPath, ocrText);
    }
  }

  safeLog(`🧵 缝合所有块文本...`);
  const segments: string[] = [];
  for (const task of manifest.tasks) {
    const mdPath = sys.resolvePath(workDir, `${task.outputFileName}.md`);
    if (sys.fileExists(mdPath)) {
      const content = sys.readFileText(mdPath).trim();
      if (content) segments.push(content);
    }
  }

  sys.writeFileText(finalMdPath, segments.join('\n\n---\n\n'));
  safeLog(`🧹 清理临时工作目录: ${workDir}`);
  sys.removeDirRecursively(workDir);
  safeLog(`\n🎉 解析完成！最终文件: ${finalMdPath} (${formatFileSize(sys.getFileSize(finalMdPath))})`);
}

// ============================================================================
// 6. CLI 入口
// ============================================================================
if (sys.isNode()) {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    processAndExportDocument(args[0]).catch((err) => {
      safeLog('❌ 执行过程中发生未捕获异常:', err);
      process.exit(1);
    });
  } else {
    safeLog('⚠️ 请提供 PDF 文件路径。');
  }
} else {
  try {
    let targetFilePath = '';
    const rawArgs = $.NSProcessInfo.processInfo.arguments;
    const count = Number(rawArgs.count);
    for (let i = 1; i < count; i++) {
      const arg = String(rawArgs.objectAtIndex(i).js);
      if (!arg.startsWith('-') && !arg.endsWith('.jxa.js')) {
        targetFilePath = arg;
        break;
      }
    }

    if (targetFilePath) {
      let isDone = false;
      let errorOccurred: any = null;

      processAndExportDocument(targetFilePath)
        .then(() => (isDone = true))
        .catch((err) => {
          errorOccurred = err;
          isDone = true;
        });

      const runLoop = $.NSRunLoop.currentRunLoop;
      while (!isDone) {
        runLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.1));
      }

      if (errorOccurred) {
        safeLog(`❌ [Execution Error]: ${errorOccurred?.message || errorOccurred}`);
        if (typeof $ !== 'undefined' && $.exit) $.exit(1);
      } else {
        if (typeof $ !== 'undefined' && $.exit) $.exit(0);
      }
    }
  } catch (err: any) {
    safeLog('❌ [JXA Global Error]', err?.message || String(err));
    if (typeof $ !== 'undefined' && $.exit) $.exit(1);
  }
}