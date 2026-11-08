// =============================================================================
// 0. 全局类型与环境声明
// =============================================================================
declare const ObjC: any;
declare const $: any;
declare const Ref: any;
declare const process: any;
declare const require: any;
declare const module: any;
declare const __filename: string;

// ============================================================================
// 1. JXA/ObjC 环境初始化与基础 IO 封装 (Foundation / AppKit / PDFKit)
// ============================================================================
function initJxaEnvironment(): boolean {
  if (typeof ObjC !== 'undefined') {
    ObjC.import('stdlib');
    ObjC.import('Foundation');
    ObjC.import('AppKit');
    ObjC.import('PDFKit');
    return true;
  }
  return false;
}

export const NativeIO = {
  /**
   * 将相对路径/含波浪号路径转换为标准绝对路径
   */
  toAbsolutePath(filePath: string): string {
    const nsString = $(filePath).stringByExpandingTildeInPath;
    return $.NSURL.fileURLWithPath(nsString).path.js;
  },

  /**
   * 获取路径的目录部分
   */
  deletingPathExtension(filePath: string): string {
    return $(filePath).stringByDeletingPathExtension.js;
  },

  /**
   * 获取路径的最后一个文件名节点
   */
  lastPathComponent(filePath: string): string {
    return $(filePath).lastPathComponent.js;
  },

  /**
   * 递归创建目录
   */
  ensureDirExists(dirPath: string): void {
    const fm = $.NSFileManager.defaultManager;
    const isDir = Ref();
    const exists = fm.fileExistsAtPathIsDirectory($(dirPath), isDir);
    if (!exists) {
      const error = Ref();
      const success = fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
        $(dirPath),
        true,
        $({}),
        error
      );
      if (!success) {
        throw new Error(
          `无法创建输出目录: ${dirPath}, 错误: ${error[0].localizedDescription.js}`
        );
      }
    }
  },

  /**
   * UTF-8 文本文件写入
   */
  writeStringToFile(filePath: string, content: string): void {
    const str = $.NSString.stringWithString(content);
    const error = Ref();
    const success = str.writeToFileAtomicallyEncodingError(
      $(filePath),
      true,
      $.NSUTF8StringEncoding,
      error
    );
    if (!success) {
      throw new Error(
        `无法写入文件 ${filePath}: ${error[0].localizedDescription.js}`
      );
    }
  },

  /**
   * 错误日志输出至 stderr
   */
  writeStderr(msg: string): void {
    const data = $(`${msg}\n`).dataUsingEncoding($.NSUTF8StringEncoding);
    $.NSFileHandle.fileHandleWithStandardError.writeData(data);
  },

  /**
   * 输出结构化数据至 stdout（专供管道捕获）
   */
  writeStdout(msg: string): void {
    const data = $(`${msg}\n`).dataUsingEncoding($.NSUTF8StringEncoding);
    $.NSFileHandle.fileHandleWithStandardOutput.writeData(data);
  },

  /**
   * 精准解析 JXA 命令行参数：寻找 "--" 分隔符，获取其后的全部真实用户参数
   */
  getJxaArgs(): string[] {
    const argsObj = $.NSProcessInfo.processInfo.arguments;
    const count = argsObj.count;
    const allArgs: string[] = [];
    for (let i = 0; i < count; i++) {
      allArgs.push(argsObj.objectAtIndex(i).js);
    }

    const dashDashIndex = allArgs.indexOf('--');
    if (dashDashIndex !== -1 && dashDashIndex < allArgs.length - 1) {
      return allArgs.slice(dashDashIndex + 1);
    }

    // 兜底：若无 "--"，过滤掉系统内部参数及脚本路径
    return allArgs.filter((arg) => {
      const lower = arg.toLowerCase();
      const isSystemArg = lower.includes('osascript') || lower.includes('javascript') || lower.endsWith('.js');
      return !isSystemArg;
    });
  },
};

// ============================================================================
// 2. 配置解析与切分任务规划
// ============================================================================
export interface TaskItem {
  id: number;
  type: 'pdf' | 'png';
  pages: [number, number];
  outputFileName: string;
  outputPath: string;
}

export interface Manifest {
  sourceFile: string;
  totalPages: number;
  tasks: TaskItem[];
}

/**
 * 解析 JS 对象字面量或 JSON 字符串，获取需 OCR 的页码集合 (Set)
 */
export function parseOcrPages(inputStr: string): Set<number> {
  const ocrPages = new Set<number>();
  if (!inputStr) return ocrPages;
  let data: any = null;
  try {
    data = JSON.parse(inputStr);
  } catch (e) {
    try {
      data = Function(`"use strict"; return (${inputStr});`)();
    } catch (err) {
      throw new Error(
        `无法解析配置参数，请确认传入了有效的 JS 对象或 JSON 格式。\n接收内容: ${inputStr}`
      );
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

/**
 * 构建任务切片序列及 Manifest 数据结构
 */
export function planChunks(
  sourceFile: string,
  totalPages: number,
  ocrPages: Set<number>,
  outputDir: string
): Manifest {
  const tasks: TaskItem[] = [];
  let taskId = 1;
  let currentPage = 1;
  const fileName = NativeIO.lastPathComponent(sourceFile);

  while (currentPage <= totalPages) {
    const chunkName = `chunk_${taskId}`;
    if (ocrPages.has(currentPage)) {
      const outputPath = `${outputDir}/${chunkName}.png`;
      tasks.push({
        id: taskId,
        type: 'png',
        pages: [currentPage, currentPage],
        outputFileName: chunkName,
        outputPath: outputPath,
      });
      taskId++;
      currentPage++;
    } else {
      const startPage = currentPage;
      while (currentPage <= totalPages && !ocrPages.has(currentPage)) {
        currentPage++;
      }
      const endPage = currentPage - 1;
      const outputPath = `${outputDir}/${chunkName}.pdf`;
      tasks.push({
        id: taskId,
        type: 'pdf',
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

// ============================================================================
// 3. macOS 原生渲染与导出引擎 (Foundation / AppKit / PDFKit)
// ============================================================================
export function exportPdfChunk(
  pdfDoc: any,
  startPage: number,
  endPage: number,
  outputPath: string
): void {
  const newDoc = $.PDFDocument.alloc.init;
  for (let p = startPage; p <= endPage; p++) {
    const pdfPage = pdfDoc.pageAtIndex(p - 1);
    if (!pdfPage) continue;
    newDoc.insertPageAtIndex(pdfPage, newDoc.pageCount);
  }
  const url = $.NSURL.fileURLWithPath($(outputPath));
  const success = newDoc.writeToURL(url);
  if (!success) {
    throw new Error(`写入 PDF 失败: ${outputPath}`);
  }
}

export function exportPngChunk(
  pdfDoc: any,
  pageNum: number,
  outputPath: string,
  dpi: number
): void {
  const pdfPage = pdfDoc.pageAtIndex(pageNum - 1);
  if (!pdfPage) {
    throw new Error(`指定的页码超出范围: ${pageNum}`);
  }
  const backingScale = $.NSScreen.mainScreen ? $.NSScreen.mainScreen.backingScaleFactor : 2.0;
  const scaleFactor = dpi / (72.0 * backingScale);
  const pdfImageRep = $.NSPDFImageRep.imageRepWithData(
    pdfPage.dataRepresentation
  );
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
  const pngData = bitmapRep.representationUsingTypeProperties(
    $.NSPNGFileType,
    $({})
  );
  const success = pngData.writeToFileAtomically($(outputPath), true);
  if (!success) {
    throw new Error(`写入 PNG 失败: ${outputPath}`);
  }
}

// ============================================================================
// 4. CLI 主逻辑与结构化输出处理
// ============================================================================
function usage(scriptName: string) {
  NativeIO.writeStdout(
    `用法: ${scriptName} <pdfFilePath> <ocrConfigObject> [选项]\n参数:\n  pdfFilePath     要拆分的源 PDF 文件路径\n  ocrConfigObject  JS 对象或 JSON 格式\n选项:\n  -h, --help       显示帮助信息\n  --out-dir <DIR>  设置输出目录\n  --dpi <VALUE>    设置 PNG 渲染 DPI (默认: 200)`
  );
}

export function runPdfSplitter(rawArgs: string[], scriptName: string = 'pdfSplitter') {
  let positionalArgs: string[] = [];
  let outDirOption: string | null = null;
  let dpi = 200;
  let i = 0;

  while (i < rawArgs.length) {
    const opt = rawArgs[i];
    switch (opt) {
      case '-h':
      case '--help':
        usage(scriptName);
        return;
      case '--out-dir':
        if (!rawArgs[i + 1]) {
          NativeIO.writeStderr(`${scriptName}: 选项 --out-dir 需要参数`);
          return;
        }
        outDirOption = rawArgs[i + 1];
        i += 1;
        break;
      case '--dpi':
        if (!rawArgs[i + 1]) {
          NativeIO.writeStderr(`${scriptName}: 选项 --dpi 需要参数`);
          return;
        }
        dpi = parseInt(rawArgs[i + 1], 10) || 200;
        i += 1;
        break;
      default:
        if (opt.startsWith('-')) {
          NativeIO.writeStderr(`${scriptName}: 未知选项 -- '${opt}'`);
          return;
        } else {
          positionalArgs.push(opt);
        }
        break;
    }
    i += 1;
  }

  if (positionalArgs.length < 2) {
    NativeIO.writeStderr(
      `${scriptName}: 参数不足，需要提供 PDF 文件路径与 OCR 配置对象`
    );
    return;
  }

  const rawPdfPath = positionalArgs[0];
  const ocrConfigString = positionalArgs[1];

  try {
    const pdfPath = NativeIO.toAbsolutePath(rawPdfPath);
    const pdfUrl = $.NSURL.fileURLWithPath($(pdfPath));
    const pdfDoc = $.PDFDocument.alloc.initWithURL(pdfUrl);
    if (!pdfDoc) {
      throw new Error(`无法打开 PDF 文件 ${pdfPath}`);
    }
    // 强制转换为标准的 JavaScript 数字类型
    const totalPages = Number(pdfDoc.pageCount);

    let outputDir = '';
    if (outDirOption) {
      outputDir = NativeIO.toAbsolutePath(outDirOption);
    } else {
      outputDir = NativeIO.deletingPathExtension(pdfPath);
    }
    NativeIO.ensureDirExists(outputDir);

    const ocrPages = parseOcrPages(ocrConfigString);
    const manifest = planChunks(pdfPath, totalPages, ocrPages, outputDir);

    for (const task of manifest.tasks) {
      if (task.type === 'pdf') {
        exportPdfChunk(pdfDoc, task.pages[0], task.pages[1], task.outputPath);
      } else if (task.type === 'png') {
        exportPngChunk(pdfDoc, task.pages[0], task.outputPath, dpi);
      }
    }

    const exportManifest = {
      sourceFile: manifest.sourceFile,
      totalPages: manifest.totalPages,
      outputDir: outputDir,
      tasks: manifest.tasks.map((task) => ({
        id: task.id,
        type: task.type,
        pages: task.pages,
        outputFileName: task.outputFileName,
        outputPath: task.outputPath,
      })),
    };

    const manifestPath = `${outputDir}/manifest.json`;
    const manifestJsonStr = JSON.stringify(exportManifest, null, 2);
    NativeIO.writeStringToFile(manifestPath, manifestJsonStr);

    const pipelineResult = {
      status: 'success',
      outputDir: outputDir,
      manifestPath: manifestPath,
      manifest: exportManifest,
    };
    NativeIO.writeStdout(`PDF_SPLIT_RESULT_JSON_START${JSON.stringify(pipelineResult)}PDF_SPLIT_RESULT_JSON_END`);

  } catch (err: any) {
    NativeIO.writeStderr(`执行过程中出错: ${err.message || err}`);
    process.exit(1);
  }
}

// ============================================================================
// 5. 自动判断运行环境与入口控制
// ============================================================================
if (initJxaEnvironment()) {
  // --------------------------------------------------------------------------
  // 分支 A: 原生 JXA (osascript) 执行模式
  // --------------------------------------------------------------------------
  const jxaArgs = NativeIO.getJxaArgs();
  if (jxaArgs.length > 0) {
    runPdfSplitter(jxaArgs, 'pdfSplitter');
  }
} else if (typeof process !== 'undefined' && process.argv) {
  // --------------------------------------------------------------------------
  // 分支 B: 开发/CLI 模式 (使用 require.main 机制 + 临时落盘文件 + 结构化管道)
  // --------------------------------------------------------------------------
  const isMain = require.main === module;
  if (isMain) {
    const cp = require('child_process');
    const path = require('path');
    const fs = require('fs');
    const os = require('os');
    const esbuild = require('esbuild');

    const args = process.argv.slice(2);
    const scriptPath = path.resolve(__filename);

    if (args.length === 0) {
      console.error('❌ 请指定 PDF 文件路径与 OCR 配置参数。');
      process.exit(1);
    }

    let tmpRunnerPath: string = '';
    try {
      // 1. 内存编译，并通过 external 排除 Node 内置模块与 esbuild 自身
      const buildResult = esbuild.buildSync({
        entryPoints: [scriptPath],
        bundle: true,
        write: false,
        format: 'iife',
        target: 'es2020',
        platform: 'neutral',
        external: ['child_process', 'path', 'fs', 'os', 'esbuild'],
      });

      const compiledJs = buildResult.outputFiles[0].text;
      const tmpDir = fs.realpathSync(os.tmpdir());
      tmpRunnerPath = path.join(
        tmpDir,
        `pdf_splitter_runner_${Date.now()}_${Math.random().toString(36).slice(2)}.js`
      );

      fs.writeFileSync(tmpRunnerPath, compiledJs, 'utf-8');

      // 2. 调用 osascript 执行临时文件
      const osaArgs = ['-l', 'JavaScript', tmpRunnerPath, '--'].concat(args);

      console.log('⚡️ [Node 外壳] 正在通过 osascript 执行 PDF 拆分任务...');
      const stdout = cp.execFileSync('osascript', osaArgs, {
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024 * 50,
      });

      // 3. 提取结构化输出管道数据
      if (stdout.includes('PDF_SPLIT_RESULT_JSON_START')) {
        const jsonStr = stdout
          .split('PDF_SPLIT_RESULT_JSON_START')[1]
          .split('PDF_SPLIT_RESULT_JSON_END')[0]
          .trim();
        const resultData = JSON.parse(jsonStr);

        console.log('\n🎉 PDF 拆分批处理成功完成！');
        // 使用 JSON.stringify 完整打印结构化 JSON 管道输出，避免被折叠成 [Object]
        console.log('📦 结构化管道输出结果:\n', JSON.stringify(resultData, null, 2));
      } else {
        console.log(stdout);
      }

    } catch (err: any) {
      console.error('❌ 执行发生异常:', err.message || err);
      process.exit(1);
    } finally {
      // 4. 安全清理临时落盘文件
      if (tmpRunnerPath && fs.existsSync(tmpRunnerPath)) {
        try {
          fs.unlinkSync(tmpRunnerPath);
        } catch {}
      }
    }
  }
}