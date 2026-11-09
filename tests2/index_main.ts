import init, { toMarkdownBytes } from '@firecrawl/anydoc-wasm';
import { execFileSync } from 'child_process';

// ============================================================================
// 1. 环境标志位与 API 抽象层 (Node.js vs JXA)
// ============================================================================

/**
 * 是否运行在 Node.js 环境下。
 */
const IS_NODE = typeof process !== 'undefined' && process.versions && !!process.versions.node;

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
}

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
};

const JxaAdapter: SystemAdapter = {
    getScriptDir(): string {
        try {
            // @ts-ignore
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
};

const sys: SystemAdapter = IS_NODE ? NodeAdapter : JxaAdapter;

// ============================================================================
// 2. Node.js 环境下构建安全的 JXA Cocoa Bridge 代理对象 (Proxy Polyfill)
// ============================================================================

interface BridgeString {
    js: string;
    path: string;
    readonly stringByStandardizingPath: BridgeString;
    readonly stringByDeletingLastPathComponent: BridgeString;
    readonly lastPathComponent: BridgeString;
    stringByAppendingPathComponent(sub: string): BridgeString;
    toString(): string;
}

if (IS_NODE) {
    const nodePath = require('path');
    const nodeFs = require('fs');
    const globalObj = globalThis as any;

    if (typeof globalObj.ObjC === 'undefined') {
        globalObj.ObjC = {
            import: (_mod: string) => {},
            unwrap: (val: any) => {
                if (val === null || val === undefined) return val;
                if (typeof val === 'object' && 'js' in val) {
                    return val.js;
                }
                return val;
            },
        };
    }

    const createBridgeString = (strVal: any): BridgeString => {
        let rawStr = '';
        if (strVal !== null && strVal !== undefined) {
            if (typeof strVal === 'object') {
                rawStr = 'js' in strVal ? String(strVal.js || '') : String(strVal);
            } else {
                rawStr = String(strVal);
            }
        }
        return {
            js: rawStr,
            get path(): string {
                return nodePath.resolve(rawStr);
            },
            get stringByStandardizingPath(): BridgeString {
                return createBridgeString(nodePath.resolve(rawStr));
            },
            get stringByDeletingLastPathComponent(): BridgeString {
                return createBridgeString(nodePath.dirname(nodePath.resolve(rawStr)));
            },
            get lastPathComponent(): BridgeString {
                return createBridgeString(nodePath.basename(rawStr));
            },
            stringByAppendingPathComponent(sub: string): BridgeString {
                const subStr = sub && typeof sub === 'object' && 'js' in sub ? (sub as any).js : String(sub || '');
                return createBridgeString(nodePath.join(nodePath.resolve(rawStr), subStr));
            },
            toString(): string {
                return rawStr;
            },
        };
    };

    if (typeof globalObj.$ === 'undefined') {
        type DollarFunction = ((input: any) => any) & Record<string, any>;
        const baseDollar: DollarFunction = (input: any) => {
            return createBridgeString(input);
        };

        baseDollar.NSUTF8StringEncoding = 4;

        const createMockPdfDoc = (urlObj: any) => {
            let urlStr = '';
            if (urlObj && typeof urlObj === 'object') {
                if (urlObj.path && typeof urlObj.path === 'object' && 'js' in urlObj.path) {
                    urlStr = urlObj.path.js;
                } else if ('js' in urlObj) {
                    urlStr = urlObj.js;
                }
            } else if (urlObj) {
                urlStr = String(urlObj);
            }
            return {
                pageCount: 1,
                pageAtIndex: (_idx: number) => ({}),
                insertPageAtIndex: (_page: any, _idx: number) => {},
                removePageAtIndex: (_idx: number) => {},
                writeToURL: (_destUrl: any) => true,
                js: urlStr,
            };
        };

        const customClasses: Record<string, any> = {
            NSURL: {
                fileURLWithPath: (p: any) => {
                    let pathStr = '';
                    if (p !== null && p !== undefined) {
                        pathStr = typeof p === 'object' && 'js' in p ? p.js : String(p);
                    }
                    const resolved = nodePath.resolve(pathStr);
                    const bridgeResolved = createBridgeString(resolved);
                    return {
                        path: bridgeResolved,
                        absoluteString: createBridgeString(`file://${resolved}`),
                        js: resolved,
                    };
                },
            },
            PDFDocument: {
                alloc: {
                    init: {
                        initWithURL: (url: any) => createMockPdfDoc(url),
                    },
                    initWithURL: (url: any) => createMockPdfDoc(url),
                },
                PDFDocumentWithURL: (url: any) => createMockPdfDoc(url),
            },
            PDFPage: {
                alloc: {
                    init: () => ({}),
                },
            },
            NSString: {
                stringWithString: (s: any) => createBridgeString(s),
                stringWithContentsOfFileEncodingError: (filePath: any, _enc: any, _err: any) => {
                    try {
                        const p = typeof filePath === 'object' && 'js' in filePath ? filePath.js : String(filePath);
                        const content = nodeFs.readFileSync(p, 'utf-8');
                        return createBridgeString(content);
                    } catch (_) {
                        return null;
                    }
                },
            },
            NSFileManager: {
                defaultManager: {
                    fileExistsAtPath: (p: any) => {
                        const pathStr = typeof p === 'object' && 'js' in p ? p.js : String(p);
                        return nodeFs.existsSync(pathStr);
                    },
                    createDirectoryAtPathWithIntermediateDirectoriesAttributesError: (p: any, _b: boolean, _attr: any, _err: any) => {
                        const pathStr = typeof p === 'object' && 'js' in p ? p.js : String(p);
                        nodeFs.mkdirSync(pathStr, { recursive: true });
                        return true;
                    },
                },
            },
            NSProcessInfo: {
                processInfo: {
                    arguments: {
                        objectAtIndex: (idx: number) => createBridgeString(process.argv[idx] || ''),
                    },
                },
            },
        };

        globalObj.$ = new Proxy(baseDollar, {
            get(target, prop: string) {
                if (prop in target) {
                    return target[prop];
                }
                if (customClasses[prop]) {
                    return customClasses[prop];
                }
                return new Proxy(
                    {},
                    {
                        get(_t, _method: string) {
                            return (...args: any[]) => {
                                const firstArg = args[0];
                                return createBridgeString(firstArg);
                            };
                        },
                    }
                );
            },
        });
    }
}

// ============================================================================
// 3. 数据结构定义与辅助工具函数
// ============================================================================

interface TaskChunk {
    id: number;
    type: 'pdf' | 'png';
    pages: number[];
    outputFileName?: string;
    fileName?: string;
    file?: string;
    name?: string;
}

interface Manifest {
    sourceFile: string;
    totalPages: number;
    tasks: TaskChunk[];
}

function getChunkBaseName(task: TaskChunk): string {
    const name = task.outputFileName || task.fileName || task.file || task.name || `chunk_${task.id}`;
    const dotIdx = name.lastIndexOf('.');
    return dotIdx > 0 ? name.substring(0, dotIdx) : name;
}

function getChunkFullFileName(task: TaskChunk): string {
    const baseName = getChunkBaseName(task);
    const ext = task.type === 'png' ? 'png' : 'pdf';
    return `${baseName}.${ext}`;
}

function formatFileSize(bytes: number): string {
    if (bytes >= 1024 * 1024) {
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    } else if (bytes >= 1024) {
        return (bytes / 1024).toFixed(2) + ' KB';
    } else {
        return bytes + ' B';
    }
}

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

/**
 * 【安全改造】：移除 eval 风险，使用严格正则过滤与 JSON.parse 提取错误 JSON Payload
 */
function extractStandardJsonString(err: unknown): string {
    let rawJsonObj: unknown = null;

    const safeParseJsonMatch = (str: string): any => {
        const match = str.match(/\{[\s\S]*\}/);
        if (!match) return null;
        const candidate = match[0];
        try {
            return JSON.parse(candidate);
        } catch (_) {
            try {
                // 容错处理：为未加双引号的合法 key 补充双引号
                const repaired = candidate.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":');
                return JSON.parse(repaired);
            } catch (_) {
                return null;
            }
        }
    };

    if (typeof err === 'object' && err !== null) {
        const errObj = err as Record<string, unknown>;
        if (errObj.code || errObj.pages) {
            rawJsonObj = errObj;
        } else if (typeof errObj.message === 'string') {
            rawJsonObj = safeParseJsonMatch(errObj.message);
        }
    } else if (typeof err === 'string') {
        rawJsonObj = safeParseJsonMatch(err);
    }

    if (rawJsonObj) {
        return JSON.stringify(rawJsonObj);
    }
    return JSON.stringify({ code: 'needsOcr', pages: [], pageCount: 0 });
}

// ============================================================================
// 4. JXA 脚本执行封装 (管道注入、标准输出继承与作用域隔离)
// ============================================================================

const loadedModules = new Set<string>();

function runJxaScript(scriptFileName: string, fnName: string, ...args: any[]): void {
    const scriptDir = sys.getScriptDir();
    const filePath = sys.resolvePath(scriptDir, scriptFileName);

    if (!sys.fileExists(filePath)) {
        throw new Error(`无法找到待加载的依赖文件: ${filePath}`);
    }

    if (IS_NODE) {
        // 【管道与安全改造】：
        // 1. 通过 stdin 将 JavaScript 注入 osascript，避免命令行参数转义与长度截断
        // 2. 将 stdio 设置为 inherit / pipe，防止 50MB 大 Buffer 导致的内存溢出 (ENOBUFS)
        const runnerScript = `
            ObjC.import('Foundation');
            ObjC.import('AppKit');
            ObjC.import('Quartz');
            try { ObjC.import('Vision'); } catch (_) {}
            try { ObjC.import('VisionKit'); } catch (_) {}

            var scriptPath = ${JSON.stringify(filePath)};
            var args = ${JSON.stringify(args)};
            var targetFnName = ${JSON.stringify(fnName)};

            var nsContent = $.NSString.stringWithContentsOfFileEncodingError(scriptPath, $.NSUTF8StringEncoding, null);
            if (!nsContent) {
                throw new Error("Failed to read JXA script file: " + scriptPath);
            }

            // 在独立的局部闭包作用域中注入加载
            (function() {
                eval(ObjC.unwrap(nsContent));
                var targetFn = (typeof globalThis !== 'undefined' && globalThis[targetFnName]) || 
                               (typeof window !== 'undefined' && window[targetFnName]) || 
                               eval(targetFnName);

                if (typeof targetFn !== 'function') {
                    throw new Error("Target function " + targetFnName + " is not defined in " + scriptPath);
                }
                targetFn.apply(null, args);
            })();
        `;

        execFileSync('osascript', ['-l', 'JavaScript'], {
            input: runnerScript,
            encoding: 'utf-8',
            stdio: ['pipe', 'inherit', 'inherit'], // 直接输出到控制台，避免占用 Node.js 内存 Buffer
        });
    } else {
        // 【作用域隔离改造】：在 JXA 环境下使用 Function 构造函数隔离模块变量
        if (!loadedModules.has(scriptFileName)) {
            const code = sys.readFileText(filePath);
            const globalObj = globalThis as any;
            new Function('globalThis', `with(globalThis) { ${code} }`)(globalObj);
            loadedModules.add(scriptFileName);
        }

        const globalObj = globalThis as any;
        if (typeof globalObj[fnName] === 'function') {
            globalObj[fnName](...args);
        } else {
            throw new Error(`在 ${scriptFileName} 中找不到导出的函数 ${fnName}`);
        }
    }
}

// ============================================================================
// 5. 主流程控制
// ============================================================================

export async function processAndExportDocument(inputFilePath: string) {
    if (!inputFilePath) {
        throw new Error('Input file path is undefined or empty');
    }

    const absInputPath = sys.resolvePath(inputFilePath);
    const inputDir = sys.dirname(absInputPath);
    const baseNameWithExt = sys.basename(absInputPath);
    const dotIdx = baseNameWithExt.lastIndexOf('.');
    const docName = dotIdx > 0 ? baseNameWithExt.substring(0, dotIdx) : baseNameWithExt;
    const finalMdPath = sys.resolvePath(inputDir, `${docName}.md`);
    const workDir = sys.resolvePath(inputDir, docName);
    const scriptDir = sys.getScriptDir();

    if (sys.fileExists(finalMdPath)) {
        const existingSizeStr = formatFileSize(sys.getFileSize(finalMdPath));
        console.log(`⏩ 检测到已存在导出的 Markdown 文件: ${finalMdPath} (${existingSizeStr})，跳过处理。`);
        return;
    }

    console.log(`🚀 开始处理文档: ${absInputPath}`);

    // 【打包兼容性改造】：多级退避寻找 WASM 模块文件，完美适配 ncc, esbuild, bundler 场景
    let wasmBuffer: Uint8Array;
    if (IS_NODE) {
        try {
            const wasmPath = require.resolve('@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm');
            wasmBuffer = sys.readFileBuffer(wasmPath);
        } catch (_) {
            const fallbackPath = sys.resolvePath(scriptDir, 'node_modules/@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm');
            if (sys.fileExists(fallbackPath)) {
                wasmBuffer = sys.readFileBuffer(fallbackPath);
            } else {
                const globalFallback = sys.resolvePath(process.cwd(), 'node_modules/@firecrawl/anydoc-wasm/anydoc_wasm_bg.wasm');
                wasmBuffer = sys.readFileBuffer(globalFallback);
            }
        }
    } else {
        const wasmPath = sys.resolvePath(scriptDir, 'anydoc_wasm_bg.wasm');
        wasmBuffer = sys.readFileBuffer(wasmPath);
    }

    await init({ module_or_path: wasmBuffer });

    const inputBuffer = sys.readFileBuffer(absInputPath);
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

    if (!needsSplit) {
        sys.writeFileText(finalMdPath, directMarkdown);
        const sizeStr = formatFileSize(sys.getFileSize(finalMdPath));
        console.log(`\n🎉 转换完成（纯文本 PDF）！`);
        console.log(`📄 Markdown 保存路径: ${finalMdPath} (${sizeStr})`);
        return;
    }

    console.log(`✂️ 执行 PDF 页面分切...`);
    try {
        runJxaScript('pdfSplitter_call.js', 'splitPdfJXA', absInputPath, errorPayloadJson);
    } catch (e) {
        console.error(`❌ PDF 分切失败:`, e);
        if (IS_NODE) process.exit(1);
        return;
    }

    const manifestPath = sys.resolvePath(workDir, 'manifest.json');
    if (!sys.fileExists(manifestPath)) {
        console.error(`❌ 未找到 manifest.json 配置文件: ${manifestPath}`);
        if (IS_NODE) process.exit(1);
        return;
    }

    const manifest: Manifest = JSON.parse(sys.readFileText(manifestPath));
    console.log(`📋 读取 Manifest 成功，包含 ${manifest.tasks.length} 个解析任务。`);

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
                runJxaScript('visionOcr_call.js', 'recognizeImagesJXA', chunkFilePath);
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

    console.log(`🧹 正在清理临时 Chunk 工作文件夹: ${workDir}`);
    sys.removeDirRecursively(workDir);

    console.log(`\n🎉 所有任务处理完毕！`);
    console.log(`📄 最终 Markdown 导出路径: ${finalMdPath} (${finalSizeStr})`);
}

// ============================================================================
// 6. CLI / JXA 入口处理
// ============================================================================

if (IS_NODE) {
    const args = process.argv.slice(2);
    if (args.length > 0) {
        const filePath = NodeAdapter.resolvePath(args[0]);
        processAndExportDocument(filePath).catch((err) => {
            console.error('❌ 处理过程中发生未捕获的错误:', err);
            process.exit(1);
        });
    } else {
        console.log('使用说明:');
        console.log('npx tsx src/index.ts "/path/to/document.pdf"');
    }
}