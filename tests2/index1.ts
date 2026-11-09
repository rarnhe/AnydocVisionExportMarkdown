import init, { toMarkdownBytes } from '@firecrawl/anydoc-wasm';

// ============================================================================
// 1. 环境标志位与 API 抽象层 (Node.js vs JXA)
// ============================================================================

/**
 * 是否运行在 Node.js 环境下。
 * 编译为 JXA 时由打包工具（如 esbuild `--define:IS_NODE=false`）在编译期树摇处理。
 */
const IS_NODE = typeof process !== 'undefined' && process.versions && !!process.versions.node;

/**
 * 抽象文件系统与路径操作接口
 */
interface SystemAdapter {
  getScriptDir(): string;
  resolvePath(...paths: string[]): string;
  dirname(p: string): string;
  basename(p: string, ext?: string): string;
  fileExists(p: string): boolean;
  getFileSize(p: string): number;
  readFileText(p: string): string;
  readFileBuffer(p: string): Uint8Array;
  writeFileText(p: string, content: string): void;
  removeDirRecursively(p: string): void;
  execScript(scriptPath: string, args: string[]): string;
}

// Node.js 环境适配器实现
const NodeAdapter: SystemAdapter = {
  getScriptDir(): string {
    const nodePath = require('path');
    const nodeFs = require('fs');

    if (typeof __dirname === 'string' && __dirname) {
      return __dirname;
    }

    if (Array.isArray(process.argv) && process.argv[1]) {
      try {
        return nodePath.dirname(nodePath.resolve(process.argv[1]));
      } catch (_) {}
    }

    const cwd = process.cwd();
    const srcPath = nodePath.join(cwd, 'src');
    if (nodeFs.existsSync(srcPath)) {
      return srcPath;
    }
    return cwd;
  },

  resolvePath(...paths: string[]): string {
    const nodePath = require('path');
    const validPaths = paths.filter((p): p is string => typeof p === 'string' && p.length > 0);
    return nodePath.resolve(...validPaths);
  },

  dirname(p: string): string {
    return require('path').dirname(p);
  },

  basename(p: string, ext?: string): string {
    return require('path').basename(p, ext);
  },

  fileExists(p: string): boolean {
    return require('fs').existsSync(p);
  },

  getFileSize(p: string): number {
    try {
      const stats = require('fs').statSync(p);
      return stats.size || 0;
    } catch (_) {
      return 0;
    }
  },

  readFileText(p: string): string {
    return require('fs').readFileSync(p, 'utf-8');
  },

  readFileBuffer(p: string): Uint8Array {
    const buf = require('fs').readFileSync(p);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  },

  writeFileText(p: string, content: string): void {
    require('fs').writeFileSync(p, content, 'utf-8');
  },

  removeDirRecursively(p: string): void {
    const fs = require('fs');
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
    }
  },

  execScript(scriptPath: string, args: string[]): string {
    const { execFileSync } = require('child_process');
    return execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', scriptPath, ...args], {
      encoding: 'utf-8',
    });
  },
};

// JXA (macOS Automation) 环境适配器实现
const JxaAdapter: SystemAdapter = {
  getScriptDir(): string {
    try {
      // @ts-ignore (JXA global)
      ObjC.import('Foundation');
      // @ts-ignore
      const args = $.NSProcessInfo.processInfo.arguments;
      // @ts-ignore
      const scriptPath = ObjC.unwrap(args.objectAtIndex(1));
      if (scriptPath) {
        // @ts-ignore
        const nsStr = $.NSString.stringWithString(scriptPath);
        // @ts-ignore
        return ObjC.unwrap(nsStr.stringByDeletingLastPathComponent);
      }
    } catch (_) {}
    return '.';
  },

  resolvePath(...paths: string[]): string {
    const cleanPaths = paths.filter(Boolean);
    if (cleanPaths.length === 0) return '';
    // @ts-ignore
    ObjC.import('Foundation');
    let fullPath = cleanPaths.join('/');
    // @ts-ignore
    return ObjC.unwrap($(fullPath).stringByStandardizingPath);
  },

  dirname(p: string): string {
    // @ts-ignore
    ObjC.import('Foundation');
    // @ts-ignore
    return ObjC.unwrap($(p).stringByDeletingLastPathComponent);
  },

  basename(p: string, ext?: string): string {
    // @ts-ignore
    ObjC.import('Foundation');
    // @ts-ignore
    let name = ObjC.unwrap($(p).lastPathComponent);
    if (ext && name.endsWith(ext)) {
      name = name.slice(0, -ext.length);
    }
    return name;
  },

  fileExists(p: string): boolean {
    // @ts-ignore
    ObjC.import('Foundation');
    // @ts-ignore
    return $.NSFileManager.defaultManager.fileExistsAtPath(p);
  },

  getFileSize(p: string): number {
    try {
      // @ts-ignore
      ObjC.import('Foundation');
      // @ts-ignore
      const fileAttrs = $.NSFileManager.defaultManager.attributesOfItemAtPathError(p, null);
      if (fileAttrs) {
        // @ts-ignore
        return ObjC.unwrap(fileAttrs.objectForKey($.NSFileSize)) || 0;
      }
    } catch (_) {}
    return 0;
  },

  readFileText(p: string): string {
    // @ts-ignore
    ObjC.import('Foundation');
    // @ts-ignore
    const nsStr = $.NSString.stringWithContentsOfFileEncodingError(p, $.NSUTF8StringEncoding, null);
    // @ts-ignore
    return ObjC.unwrap(nsStr);
  },

  readFileBuffer(p: string): Uint8Array {
    // @ts-ignore
    ObjC.import('Foundation');
    // @ts-ignore
    const nsData = $.NSData.dataWithContentsOfFile(p);
    // @ts-ignore
    const length = nsData.length;
    const buffer = new Uint8Array(length);
    // @ts-ignore
    nsData.getBytesLength(buffer, length);
    return buffer;
  },

  writeFileText(p: string, content: string): void {
    // @ts-ignore
    ObjC.import('Foundation');
    // @ts-ignore
    const nsStr = $.NSString.stringWithString(content);
    // @ts-ignore
    nsStr.writeToFileAtomicallyEncodingError(p, true, $.NSUTF8StringEncoding, null);
  },

  removeDirRecursively(p: string): void {
    try {
      // @ts-ignore
      ObjC.import('Foundation');
      // @ts-ignore
      const fm = $.NSFileManager.defaultManager;
      // @ts-ignore
      if (fm.fileExistsAtPath(p)) {
        // @ts-ignore
        fm.removeItemAtPathError(p, null);
      }
    } catch (_) {}
  },

  execScript(_scriptPath: string, _args: string[]): string {
    throw new Error('JXA 模式下请直接调用内置 Vision/Foundation 模块，无需二次 execScript 调度。');
  },
};

// 运行时绑定当前适用的系统 API
const sys: SystemAdapter = IS_NODE ? NodeAdapter : JxaAdapter;

// ============================================================================
// 2. 数据结构定义与文件名推演函数
// ============================================================================

interface TaskChunk {
  id: number;
  type: 'pdf' | 'png';
  pages: number[];
  outputFileName?: string; // pdfSplitter 实际输出字段
  fileName?: string;       // 备用兼容字段
  file?: string;
  name?: string;
}

interface Manifest {
  sourceFile: string;
  totalPages: number;
  tasks: TaskChunk[];
}

/**
 * 获取任务的基础文件名（不含扩展名），如 "chunk_1"
 */
function getChunkBaseName(task: TaskChunk): string {
  const name = task.outputFileName || task.fileName || task.file || task.name || `chunk_${task.id}`;
  const dotIdx = name.lastIndexOf('.');
  return dotIdx > 0 ? name.substring(0, dotIdx) : name;
}

/**
 * 拼接 outputFileName + type，获取真实包含扩展名的完整文件名，如 "chunk_1.pdf" 或 "chunk_1.png"
 */
function getChunkFullFileName(task: TaskChunk): string {
  const baseName = getChunkBaseName(task);
  const ext = task.type === 'png' ? 'png' : 'pdf';
  return `${baseName}.${ext}`;
}

/**
 * 格式化文件大小 (B / KB / MB)
 */
function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  } else if (bytes >= 1024) {
    return (bytes / 1024).toFixed(2) + ' KB';
  } else {
    return bytes + ' B';
  }
}

// ============================================================================
// 3. 核心工具逻辑
// ============================================================================

function decodeMarkdownResult(rawRes: unknown): string {
  if (typeof rawRes === 'string') {
    return rawRes;
  }
  if (rawRes && typeof rawRes === 'object') {
    const resAny = rawRes as { buffer?: ArrayBuffer };
    const bytes = rawRes instanceof Uint8Array ? rawRes : new Uint8Array(resAny.buffer || (rawRes as ArrayBuffer));
    return new TextDecoder('utf-8').decode(bytes);
  }
  return '';
}

function extractStandardJsonString(err: unknown): string {
  let rawJsonObj: unknown = null;
  if (typeof err === 'object' && err !== null) {
    const errObj = err as Record<string, unknown>;
    if (errObj.code || errObj.pages) {
      rawJsonObj = errObj;
    } else if (typeof errObj.message === 'string') {
      const match = errObj.message.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          rawJsonObj = eval(`(${match[0]})`);
        } catch (_) {}
      }
    }
  } else if (typeof err === 'string') {
    const match = err.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        rawJsonObj = eval(`(${match[0]})`);
      } catch (_) {}
    }
  }
  if (rawJsonObj) {
    return JSON.stringify(rawJsonObj);
  }
  return JSON.stringify({ code: 'needsOcr', pages: [], pageCount: 0 });
}

// ============================================================================
// 4. 主流程控制
// ============================================================================

export async function processAndExportDocument(inputFilePath: string) {
  if (!inputFilePath) {
    throw new Error('Input file path is undefined or empty');
  }

  // 安全解析绝对路径
  const absInputPath = sys.resolvePath(inputFilePath);
  const inputDir = sys.dirname(absInputPath);

  const baseNameWithExt = sys.basename(absInputPath);
  const dotIdx = baseNameWithExt.lastIndexOf('.');
  const docName = dotIdx > 0 ? baseNameWithExt.substring(0, dotIdx) : baseNameWithExt;

  const finalMdPath = sys.resolvePath(inputDir, `${docName}.md`);
  const workDir = sys.resolvePath(inputDir, docName);
  const scriptDir = sys.getScriptDir();

  // 0. 检查是否已经存在同名 Markdown，若存在则跳过处理
  if (sys.fileExists(finalMdPath)) {
    const existingSizeStr = formatFileSize(sys.getFileSize(finalMdPath));
    console.log(`⏩ 检测到已存在导出的 Markdown 文件: ${finalMdPath} (${existingSizeStr})，跳过处理。`);
    return;
  }

  console.log(`🚀 开始处理文档: ${absInputPath}`);

  // 1. WASM 初始化
  if (IS_NODE) {
    const wasmPath = require.resolve('@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm');
    const wasmBuffer = sys.readFileBuffer(wasmPath);
    await init({ module_or_path: wasmBuffer });
  } else {
    // JXA 下加载 WASM 二进制文件
    const wasmPath = sys.resolvePath(scriptDir, 'anydoc_wasm_bg.wasm');
    const wasmBuffer = sys.readFileBuffer(wasmPath);
    await init({ module_or_path: wasmBuffer });
  }

  const inputBuffer = sys.readFileBuffer(absInputPath);

  // 2. WASM 预检测
  let directMarkdown = '';
  let needsSplit = false;
  let errorPayloadJson = '';

  try {
    console.log(`🔍 正在执行 Anydoc WASM 预检测...`);
    const rawRes = toMarkdownBytes(inputBuffer);
    directMarkdown = decodeMarkdownResult(rawRes);
  } catch (err) {
    needsSplit = true;
    errorPayloadJson = extractStandardJsonString(err);
    console.log(`⚠️ 检测到扫描件/限制页面，准备进行分片处理...`);
  }

  // 3.0 电子版直接导出
  if (!needsSplit) {
    sys.writeFileText(finalMdPath, directMarkdown);
    const sizeStr = formatFileSize(sys.getFileSize(finalMdPath));
    console.log(`\n🎉 转换完成（纯文本 PDF）！`);
    console.log(`📄 Markdown 保存路径: ${finalMdPath} (${sizeStr})`);
    return;
  }

  // 3.1 分切阶段 (pdfSplitter.js)
  console.log(`✂️ 执行 PDF 页面分切...`);
  const splitterScript = sys.resolvePath(scriptDir, 'pdfSplitter_main.js'); //也可以用pdfSplitter1.js
  if (IS_NODE) {
    try {
      sys.execScript(splitterScript, [absInputPath, errorPayloadJson]);
    } catch (e) {
      console.error(`❌ PDF 分切失败:`, e);
      process.exit(1);
    }
  } else {
    console.log(`JXA 模式：执行内置 pdfSplitter 函数...`);
  }

  // 3.2 读取 Manifest
  const manifestPath = sys.resolvePath(workDir, 'manifest.json');
  if (!sys.fileExists(manifestPath)) {
    console.error(`❌ 未找到 manifest.json 配置文件: ${manifestPath}`);
    if (IS_NODE) process.exit(1);
    return;
  }

  const manifest: Manifest = JSON.parse(sys.readFileText(manifestPath));
  console.log(`📋 读取 Manifest 成功，包含 ${manifest.tasks.length} 个解析任务。`);

  // 4. 任务调度
  const visionOcrScript = sys.resolvePath(scriptDir, 'visionOcr_main.js'); //也可以用visionOcr1.js

  for (const task of manifest.tasks) {
    const chunkFileName = getChunkFullFileName(task);
    const chunkNameWithoutExt = getChunkBaseName(task);
    const chunkFilePath = sys.resolvePath(workDir, chunkFileName);
    const standardMdPath = sys.resolvePath(workDir, `${chunkNameWithoutExt}.md`);
    const tradMdPath = sys.resolvePath(workDir, `${chunkNameWithoutExt}.zh-Hant.md`);

    if (task.type === 'pdf') {
      console.log(`  [Chunk ${task.id}/${manifest.tasks.length}] 解析pdf (Anydoc): ${chunkFileName}`);
      const pdfBuffer = sys.readFileBuffer(chunkFilePath);
      const resBytes = toMarkdownBytes(pdfBuffer);
      const mdContent = decodeMarkdownResult(resBytes);
      sys.writeFileText(standardMdPath, mdContent);

      const fileSize = sys.getFileSize(standardMdPath);
      const sizeStr = formatFileSize(fileSize);
      console.log(`  -> 已导出: ${standardMdPath} (${sizeStr})`);
    } else if (task.type === 'png') {
      console.log(`  [Chunk ${task.id}/${manifest.tasks.length}] 扫描png (Vision OCR): ${chunkFileName}`);
      try {
        if (IS_NODE) {
          sys.execScript(visionOcrScript, [chunkFilePath]);
        } else {
          // JXA 模式可以直接调用 Foundation/Vision Framework 接口
        }

        // 检索生成的 Markdown 文件并输出大小信息
        let generatedMdPath = '';
        if (sys.fileExists(tradMdPath)) {
          generatedMdPath = tradMdPath;
        } else if (sys.fileExists(standardMdPath)) {
          generatedMdPath = standardMdPath;
        }

        if (generatedMdPath) {
          const fileSize = sys.getFileSize(generatedMdPath);
          const sizeStr = formatFileSize(fileSize);
          console.log(`  -> 已导出: ${generatedMdPath} (${sizeStr})`);
        } else {
          console.error(`  ❌ 未找到生成的 Markdown 文件: ${standardMdPath}`);
        }
      } catch (ocrErr) {
        console.error(`  ❌ Chunk ${task.id} Vision OCR 执行失败:`, ocrErr);
      }
    }
  }

  // 5. 缝合阶段
  console.log(`🧵 正在按顺序缝合各 Chunk 的 Markdown 文本...`);
  const markdownChunks: string[] = [];

  for (const task of manifest.tasks) {
    const chunkNameWithoutExt = getChunkBaseName(task);
    const standardMdPath = sys.resolvePath(workDir, `${chunkNameWithoutExt}.md`);
    const tradMdPath = sys.resolvePath(workDir, `${chunkNameWithoutExt}.zh-Hant.md`);

    let actualMdPath = '';
    if (sys.fileExists(tradMdPath)) {
      actualMdPath = tradMdPath;
    } else if (sys.fileExists(standardMdPath)) {
      actualMdPath = standardMdPath;
    }

    if (actualMdPath && sys.fileExists(actualMdPath)) {
      const content = sys.readFileText(actualMdPath).trim();
      if (content.length > 0) {
        markdownChunks.push(content);
      }
    }
  }

  const finalMergedMarkdown = markdownChunks.join('\n\n---\n\n');
  sys.writeFileText(finalMdPath, finalMergedMarkdown);

  const finalSizeStr = formatFileSize(sys.getFileSize(finalMdPath));

  // 6. 清理阶段：删除分切时生成的临时工作文件夹
  console.log(`🧹 正在清理临时 Chunk 工作文件夹: ${workDir}`);
  sys.removeDirRecursively(workDir);

  console.log(`\n🎉 所有任务处理完毕！`);
  console.log(`📄 最终 Markdown 导出路径: ${finalMdPath} (${finalSizeStr})`);
}

// ============================================================================
// 5. CLI / JXA 入口处理
// ============================================================================

if (IS_NODE) {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    const filePath = NodeAdapter.resolvePath(args[0]);
    processAndExportDocument(filePath).catch((err) => {
      console.error('❌ 处理过程中发生未捕获的错误:', err);
    });
  } else {
    console.log('使用说明:');
    console.log('npx tsx src/index.ts "/path/to/document.pdf"');
  }
}