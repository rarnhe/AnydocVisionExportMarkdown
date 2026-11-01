declare const ObjC: any;
declare const $: any;
declare const Ref: any;
declare const process: any;

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
      const success =
        fm.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
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
   * 输出日志至 stderr
   */
  writeStderr(msg: string): void {
    const data = $(`${msg}\n`).dataUsingEncoding($.NSUTF8StringEncoding);
    $.NSFileHandle.fileHandleWithStandardError.writeData(data);
  },

  /**
   * 输出日志至 stdout
   */
  writeStdout(msg: string): void {
    const data = $(`${msg}\n`).dataUsingEncoding($.NSUTF8StringEncoding);
    $.NSFileHandle.fileHandleWithStandardOutput.writeData(data);
  },

  /**
   * 解析参数入口 (纯 JXA 模式)
   * 兼容 osascript -e "..." -- <args> 以及 osascript file.js <args>
   */
  getJxaArgs(): string[] {
    const argsObj = $.NSProcessInfo.processInfo.arguments;
    const count = argsObj.count;
    const allArgs: string[] = [];

    for (let i = 0; i < count; i++) {
      allArgs.push(argsObj.objectAtIndex(i).js);
    }

    // 优先寻找 "--" 标记，截取其后的真实参数列表
    const dashDashIndex = allArgs.indexOf('--');
    if (dashDashIndex !== -1) {
      return allArgs.slice(dashDashIndex + 1);
    }

    // 兜底：若无 "--" 标记（如直接运行独立 JS 脚本文件），跳过前 3 个 osascript 内部启动参数
    return allArgs.length > 3 ? allArgs.slice(3) : [];
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
      // 兼容 CLI 传入的 JS 对象字面量 (如 `{ code: 'needsOcr', pages: [12, 17] }`)
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
      // OCR 页：拆分为单页 PNG 任务
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
      // 普通页：合并连续非 OCR 页为 PDF 任务
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

/**
 * 截取并导出 PDF 切片
 */
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

/**
 * 栅格化单页 PDF 并导出为高清 PNG
 */
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

  const backingScale = $.NSScreen.mainScreen
    ? $.NSScreen.mainScreen.backingScaleFactor
    : 2.0;
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
// 4. CLI 主逻辑与双流程入口控制
// ============================================================================

function usage(scriptName: string) {
  NativeIO.writeStdout(`用法: ${scriptName} <pdfFilePath> <ocrConfigObject> [选项]

参数:
  pdfFilePath      要拆分的源 PDF 文件路径
  ocrConfigObject  JS 对象或 JSON 格式，例如: "{ code: 'needsOcr', pages: [ 12, 17, 20 ], pageCount: 56 }"

选项:
  -h, --help       显示帮助信息
  --out-dir <DIR>  设置输出目录 (默认: 与 PDF 同级的同名文件夹)
  --dpi <VALUE>    设置 PNG 渲染 DPI (默认: 200)`);
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
    NativeIO.writeStderr(`尝试 '${scriptName} --help' 获取详细信息。`);
    return;
  }

  const rawPdfPath = positionalArgs[0];
  const ocrConfigString = positionalArgs[1];

  try {
    // 1. 规范化路径与初始化 PDFDocument
    const pdfPath = NativeIO.toAbsolutePath(rawPdfPath);
    const pdfUrl = $.NSURL.fileURLWithPath($(pdfPath));
    const pdfDoc = $.PDFDocument.alloc.initWithURL(pdfUrl);

    if (!pdfDoc) {
      NativeIO.writeStderr(`错误: 无法打开 PDF 文件 ${pdfPath}`);
      return;
    }

    const totalPages = pdfDoc.pageCount;

    // 2. 确定输出目录路径
    let outputDir = '';
    if (outDirOption) {
      outputDir = NativeIO.toAbsolutePath(outDirOption);
    } else {
      outputDir = NativeIO.deletingPathExtension(pdfPath);
    }

    NativeIO.ensureDirExists(outputDir);

    // 3. 解析需要 OCR 的页码
    const ocrPages = parseOcrPages(ocrConfigString);

    // 4. 构建任务与 Manifest 数据
    const manifest = planChunks(pdfPath, totalPages, ocrPages, outputDir);

    // 5. 导出文件 (PDF & PNG)
    for (const task of manifest.tasks) {
      if (task.type === 'pdf') {
        exportPdfChunk(pdfDoc, task.pages[0], task.pages[1], task.outputPath);
      } else if (task.type === 'png') {
        exportPngChunk(pdfDoc, task.pages[0], task.outputPath, dpi);
      }
    }

    // 6. 整理导出 Manifest 数据
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
    NativeIO.writeStringToFile(manifestPath, manifestJsonStr);

    NativeIO.writeStdout(`处理成功！切分结果及清单已输出至: ${outputDir}`);
  } catch (err: any) {
    NativeIO.writeStderr(`执行过程中出错: ${err.message || err}`);
  }
}

// ============================================================================
// 5. 自动判断运行环境与入口逻辑
// ============================================================================

if (initJxaEnvironment()) {
  // --------------------------------------------------------------------------
  // 分支 A: 原生 JXA (osascript) 或打包后的生产模式直接运行
  // --------------------------------------------------------------------------
  const rawJxaArgs = NativeIO.getJxaArgs();
  if (rawJxaArgs.length > 0) {
    const scriptName = NativeIO.lastPathComponent(rawJxaArgs[0]);
    const args = rawJxaArgs.slice(1);
    runPdfSplitter(args, scriptName);
  }
} else if (typeof process !== 'undefined' && process.argv) {
  // --------------------------------------------------------------------------
  // 分支 B: 开发模式 (npx tsx src/pdfSplitter.ts)
  // 利用 process.mainModule 获取 Node 内部加载器，借助 esbuild 内存打包转译为
  // JXA 兼容的纯 JS 脚本，彻底避免 Node 静态 require / eval 与语法解析报错
  // --------------------------------------------------------------------------
  const mainModule = process.mainModule || (process as any).module;
  if (mainModule && typeof mainModule.require === 'function') {
    const cp = mainModule.require('child_process');
    const p = mainModule.require('path');
    const esbuild = mainModule.require('esbuild');

    const args = process.argv.slice(2);
    const scriptPath = p.resolve(process.argv[1]);

    try {
      const buildResult = esbuild.buildSync({
        entryPoints: [scriptPath],
        bundle: true,
        write: false,
        format: 'iife',
        target: 'es2020',
        platform: 'neutral',
      });

      const compiledJs = buildResult.outputFiles[0].text;

      // 使用 concat 代替 ...args，避免旧环境构建语法兼容问题
      const osaArgs = ['-l', 'JavaScript', '-e', compiledJs, '--', scriptPath].concat(args);

      cp.execFileSync('osascript', osaArgs, {
        stdio: 'inherit',
      });
    } catch (err: any) {
      process.exit(err.status || 1);
    }
  }
}