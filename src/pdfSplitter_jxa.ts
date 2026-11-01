// ============================================================================
// 1. 类型与环境声明
// ============================================================================
declare global {
  var ObjC: any;
  var $: any;
  var Ref: any;
  var IS_JXA_BUILD: boolean | undefined;
}

// 保证当前文件被 TS 识别为 ES Module
export {};

declare const require: any;
declare const process: any;

// ============================================================================
// 2. 核心 JXA 执行函数 (自包含，可被 @jxa/run 完整序列化传输)
// ============================================================================
export function executePdfSplitInJxa(
  rawPdfPath: string,
  ocrConfigString: string,
  outDirOption: string | null,
  dpi: number
): { success: boolean; outputDir?: string; error?: string } {
  // 防护：esbuild 转译注入的 __name / __getOwnPropNames 在 JXA 环境中无定义
  if (typeof (globalThis as any).__name === 'undefined') {
    (globalThis as any).__name = (fn: any) => fn;
  }

  // 环境与 Cocoa 框架动态加载
  if (typeof ObjC !== 'undefined') {
    ObjC.import('Foundation');
    ObjC.import('AppKit');
    ObjC.import('PDFKit');
  } else {
    return { success: false, error: '非 JXA 运行环境' };
  }

  try {
    // 内置绝对路径展开与处理
    const expandPath = (p: string) => $(p).stringByExpandingTildeInPath.js;
    const pdfPath = expandPath(rawPdfPath);
    const pdfUrl = $.NSURL.fileURLWithPath($(pdfPath));
    const pdfDoc = $.PDFDocument.alloc.initWithURL(pdfUrl);

    if (!pdfDoc) {
      return { success: false, error: `无法打开 PDF 文件: ${pdfPath}` };
    }

    const totalPages = pdfDoc.pageCount;
    const outputDir = outDirOption
      ? expandPath(outDirOption)
      : $(pdfPath).stringByDeletingPathExtension.js;

    // 目录确认与创建
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
          error: `无法创建目录: ${outputDir}, 原因: ${createErr[0]?.localizedDescription?.js || '未知错误'}`
        };
      }
    }

    // 解析 OCR 页码集合
    const ocrPages = new Set<number>();
    if (ocrConfigString) {
      let data: any = null;
      try {
        data = JSON.parse(ocrConfigString);
      } catch (e) {
        try {
          data = Function(`"use strict"; return (${ocrConfigString});`)();
        } catch (err) {}
      }
      if (data && Array.isArray(data.pages)) {
        for (const page of data.pages) {
          const p = Number(page);
          if (!isNaN(p)) ocrPages.add(p);
        }
      }
    }

    // 规划切分任务
    const tasks: Array<{
      id: number;
      type: 'pdf' | 'png';
      pages: [number, number];
      outputFileName: string;
      outputPath: string;
    }> = [];

    let taskId = 1;
    let currentPage = 1;

    while (currentPage <= totalPages) {
      const chunkName = `chunk_${taskId}`;
      if (ocrPages.has(currentPage)) {
        tasks.push({
          id: taskId,
          type: 'png',
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
          type: 'pdf',
          pages: [startPage, endPage],
          outputFileName: chunkName,
          outputPath: `${outputDir}/${chunkName}.pdf`
        });
        taskId++;
      }
    }

    // 计算渲染缩放比例
    const backingScale = $.NSScreen.mainScreen ? $.NSScreen.mainScreen.backingScaleFactor : 2.0;
    const scaleFactor = dpi / (72.0 * backingScale);

    // 批量渲染与导出
    for (const task of tasks) {
      if (task.type === 'pdf') {
        const newDoc = $.PDFDocument.alloc.init;
        for (let p = task.pages[0]; p <= task.pages[1]; p++) {
          const pdfPage = pdfDoc.pageAtIndex(p - 1);
          if (pdfPage) newDoc.insertPageAtIndex(pdfPage, newDoc.pageCount);
        }
        const url = $.NSURL.fileURLWithPath($(task.outputPath));
        newDoc.writeToURL(url);
      } else if (task.type === 'png') {
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

    // 导出清单 manifest.json
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
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

// ============================================================================
// 3. 通用 CLI 参数解析器
// ============================================================================
export interface ParsedCliArgs {
  pdfPath: string;
  ocrConfig: string;
  outDir: string | null;
  dpi: number;
  showHelp: boolean;
  error?: string;
}

export function parseCliArgs(rawArgs: string[]): ParsedCliArgs {
  let positional: string[] = [];
  let outDir: string | null = null;
  let dpi = 200;
  let i = 0;

  while (i < rawArgs.length) {
    const arg = rawArgs[i];
    if (arg === '-h' || arg === '--help') {
      return { pdfPath: '', ocrConfig: '', outDir: null, dpi: 200, showHelp: true };
    } else if (arg === '--out-dir') {
      if (!rawArgs[i + 1])
        return { pdfPath: '', ocrConfig: '', outDir: null, dpi: 200, showHelp: false, error: '--out-dir 缺少值' };
      outDir = rawArgs[i + 1];
      i++;
    } else if (arg === '--dpi') {
      if (!rawArgs[i + 1])
        return { pdfPath: '', ocrConfig: '', outDir: null, dpi: 200, showHelp: false, error: '--dpi 缺少值' };
      dpi = parseInt(rawArgs[i + 1], 10) || 200;
      i++;
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    }
    i++;
  }

  if (positional.length < 2) {
    return {
      pdfPath: '',
      ocrConfig: '',
      outDir: null,
      dpi: 200,
      showHelp: false,
      error: '参数不足，需要提供 PDF 文件路径与 OCR 配置对象'
    };
  }

  return { pdfPath: positional[0], ocrConfig: positional[1], outDir, dpi, showHelp: false };
}

function showHelpText() {
  console.log(`用法: pdfSplitter <pdfFilePath> <ocrConfigObject> [选项]
选项:
  -h, --help       显示帮助信息
  --out-dir <DIR>  设置输出目录 (默认: 与 PDF 同级的同名文件夹)
  --dpi <VALUE>    设置 PNG 渲染 DPI (默认: 200)`);
}

// ============================================================================
// 4. Node.js 独立处理逻辑 (调用 @jxa/run)
// ============================================================================
export async function processPdfSplitNode(rawArgs: string[]): Promise<boolean> {
  if (typeof IS_JXA_BUILD !== 'undefined' && IS_JXA_BUILD) {
    return false;
  }

  const { run: runJxa } = require('@jxa/run');
  const parsed = parseCliArgs(rawArgs);

  if (parsed.showHelp) {
    showHelpText();
    return true;
  }
  if (parsed.error) {
    console.error(`错误: ${parsed.error}`);
    showHelpText();
    return false;
  }

  const result = (await runJxa(
    executePdfSplitInJxa,
    parsed.pdfPath,
    parsed.ocrConfig,
    parsed.outDir,
    parsed.dpi
  )) as { success: boolean; outputDir?: string; error?: string };

  if (result.success) {
    console.log(`[Node Success] 切分成功！文件输出至: ${result.outputDir}`);
    return true;
  } else {
    console.error(`[Node Error] 执行失败: ${result.error}`);
    return false;
  }
}

// ============================================================================
// 5. 环境分流入口
// ============================================================================

// --- 分支 A: 纯 JXA 宿主环境 (IS_JXA_BUILD = true) ---
if (typeof IS_JXA_BUILD !== 'undefined' && IS_JXA_BUILD) {
  const getJxaArgs = (): string[] => {
    const argsObj = $.NSProcessInfo.processInfo.arguments;
    const count = argsObj.count;
    const allArgs: string[] = [];
    for (let i = 0; i < count; i++) {
      allArgs.push(argsObj.objectAtIndex(i).js);
    }
    const dashDashIndex = allArgs.indexOf('--');
    if (dashDashIndex !== -1) return allArgs.slice(dashDashIndex + 1);
    return allArgs.length > 3 ? allArgs.slice(3) : [];
  };

  const rawJxaArgs = getJxaArgs();
  const scriptArgs = rawJxaArgs.length > 0 ? rawJxaArgs.slice(1) : [];
  const parsed = parseCliArgs(scriptArgs);

  if (parsed.showHelp) {
    showHelpText();
  } else if (parsed.error) {
    console.error(`错误: ${parsed.error}`);
  } else {
    const res = executePdfSplitInJxa(
      parsed.pdfPath,
      parsed.ocrConfig,
      parsed.outDir,
      parsed.dpi
    );
    if (res.success) {
      console.log(`[JXA Success] 切分成功！文件输出至: ${res.outputDir}`);
    } else {
      console.error(`[JXA Error] 执行失败: ${res.error}`);
    }
  }
}

// --- 分支 B: Node.js / CLI 运行环境 ---
if (typeof IS_JXA_BUILD === 'undefined' || !IS_JXA_BUILD) {
  if (typeof process !== 'undefined' && process.argv) {
    const isDirectRun =
      process.argv[1]?.endsWith('pdfSplitter.node.js') ||
      process.argv[1]?.endsWith('pdfSplitter.ts');

    if (isDirectRun) {
      const args = process.argv.slice(2);
      processPdfSplitNode(args);
    }
  }
}