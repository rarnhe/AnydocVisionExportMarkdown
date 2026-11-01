declare const ObjC: any;
declare const $: any;
declare const Ref: any;
declare const process: any;

// 支持的图片扩展名集合
const SUPPORTED_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'tiff',
  'bmp',
  'heic',
  'webp',
]);

// ============================================================================
// 1. JXA 环境初始化与 ObjC 框架加载
// ============================================================================
function initJxaEnvironment(): boolean {
  if (typeof ObjC !== 'undefined') {
    ObjC.import('stdlib');
    ObjC.import('Foundation');
    ObjC.import('AppKit');
    ObjC.import('Vision');
    return true;
  }
  return false;
}

// ============================================================================
// 2. 纯 Foundation 原生文件系统与 Vision OCR 接口
// ============================================================================
export const NativeIO = {
  /**
   * 展开波浪号 ~ 路径并规范化为绝对路径
   */
  expandTildePath(p: string): string {
    return $(p).stringByExpandingTildeInPath.stringByStandardizingPath.js;
  },

  /**
   * 检查路径是否存在且为普通文件
   */
  isFileSync(p: string): boolean {
    const fm = $.NSFileManager.defaultManager;
    const isDir = Ref();
    const exists = fm.fileExistsAtPathIsDirectory($(p), isDir);
    return exists && !isDir[0];
  },

  /**
   * 调用 macOS Vision 框架进行文本识别 (高精度 / Revision 3 / 0.01 最小高度)
   */
  performOcr(filePath: string, targetLang: 'zh-Hans' | 'zh-Hant'): string {
    const fileURL = $.NSURL.fileURLWithPath($(filePath));
    const request = $.VNRecognizeTextRequest.alloc.init;

    // 引擎强化参数配置
    request.setRecognitionLevel($.VNRequestTextRecognitionLevelAccurate);
    request.setUsesLanguageCorrection(true);
    request.setRevision(3);
    request.setMinimumTextHeight(0.01);
    request.setRecognitionLanguages($([targetLang]));

    const requestHandler = $.VNImageRequestHandler.alloc.initWithURLOptions(
      fileURL,
      $({})
    );

    const error = Ref();
    const success = requestHandler.performRequestsError($([request]), error);

    if (!success) {
      const errDesc = error[0] ? error[0].localizedDescription.js : '未知原生错误';
      this.writeStderr(`[VisionOCR Error] 识别失败 (${targetLang}): ${errDesc}`);
      return '';
    }

    const results = request.results;

    // 安全判空（兼容 nil 指针、undefined 或 JXA 桥接类型）
    if (!results || results == $.nil) {
      return '';
    }

    // 将 NSArray 提解为 JS 数组，规避 .equals 与 .count 类型崩溃
    const rawResults = results.js || results;
    const count = rawResults.length || (results.count ? results.count : 0);

    if (count === 0) {
      return '';
    }

    const fullTextLines: string[] = [];

    for (let i = 0; i < count; i++) {
      const observation =
        rawResults[i] || (results.objectAtIndex && results.objectAtIndex(i));
      if (!observation || observation == $.nil) continue;

      const candidates = observation.topCandidates(1);
      if (!candidates || candidates == $.nil) continue;

      const topCandidate =
        (candidates.js && candidates.js[0]) ||
        (candidates.objectAtIndex && candidates.objectAtIndex(0));

      if (topCandidate && topCandidate != $.nil) {
        fullTextLines.push(topCandidate.string.js);
      }
    }

    return fullTextLines.join('\n');
  },

  /**
   * 将字符串写入目标文件 (UTF-8)
   */
  writeTextFileSync(outPath: string, content: string): boolean {
    const nsText = $.NSString.stringWithString(content);
    const outURL = $.NSURL.fileURLWithPath($(outPath));
    const writeError = Ref();
    return nsText.writeToURLAtomicallyEncodingError(
      outURL,
      true,
      $.NSUTF8StringEncoding,
      writeError
    );
  },

  /**
   * 错误日志输出至 stderr
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
   * 从 NSProcessInfo 获取命令行参数 (纯 JXA 模式)
   * 优先寻找 "--" 标记，截取其后的真实参数列表，并过滤掉脚本文件路径与选项
   */
  getJxaArgs(): string[] {
    const argsObj = $.NSProcessInfo.processInfo.arguments;
    const count = argsObj.count;
    const allArgs: string[] = [];

    for (let i = 0; i < count; i++) {
      allArgs.push(argsObj.objectAtIndex(i).js);
    }

    let userArgs: string[] = [];
    const dashDashIndex = allArgs.indexOf('--');
    if (dashDashIndex !== -1) {
      userArgs = allArgs.slice(dashDashIndex + 1);
    } else {
      // 兜底：若无 "--" 标记，跳过前 3 个 osascript 内部启动参数
      userArgs = allArgs.length > 3 ? allArgs.slice(3) : [];
    }

    // 过滤掉当前脚本路径（以 .ts、.js、.jxa 结尾的文件）以及选项标志位
    return userArgs.filter((arg) => {
      const lower = arg.toLowerCase();
      const isScriptFile =
        lower.endsWith('.ts') || lower.endsWith('.js') || lower.endsWith('.jxa');
      return !arg.startsWith('-') && !isScriptFile;
    });
  },
};

// ============================================================================
// 3. 核心业务逻辑
// ============================================================================

/**
 * 判定繁体字是否占主要地位
 */
export function isTraditionalChineseDominant(text: string): boolean {
  if (!text) return false;
  const tradSample = /[繁體廣國會機關經濟進與實對學寶產關華區線點開]/g;
  const simpSample = /[简体广国会机关经济进与实对学宝产关华区线点开]/g;
  const tradMatches = (text.match(tradSample) || []).length;
  const simpMatches = (text.match(simpSample) || []).length;
  return tradMatches > simpMatches;
}

/**
 * 处理单张图片 OCR 流程 (纯 Native API 实现)
 */
export function processImageFile(rawPath: string): string | null {
  const normalizedPath = NativeIO.expandTildePath(rawPath);
  if (!NativeIO.isFileSync(normalizedPath)) {
    NativeIO.writeStderr(`[Error] 路径无效或非正常文件: ${normalizedPath}`);
    return null;
  }

  const extIndex = normalizedPath.lastIndexOf('.');
  const ext =
    extIndex !== -1 ? normalizedPath.slice(extIndex + 1).toLowerCase() : '';

  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    NativeIO.writeStderr(
      `[Error] 不支持的文件扩展名 (.${ext}): ${normalizedPath}`
    );
    return null;
  }

  // 1. 优先采用简体中文识别 (高精度 + Revision 3)
  let text = NativeIO.performOcr(normalizedPath, 'zh-Hans');
  const isTraditional = isTraditionalChineseDominant(text);

  // 2. 若检测到繁体为主，切换繁体引擎二次识别
  if (isTraditional) {
    text = NativeIO.performOcr(normalizedPath, 'zh-Hant');
  }

  // 3. 构建输出 Markdown 文件路径
  const basePath =
    extIndex !== -1 ? normalizedPath.slice(0, extIndex) : normalizedPath;
  const outputPath = isTraditional
    ? `${basePath}.zh-Hant.md`
    : `${basePath}.md`;

  // 4. 写入 Markdown
  const success = NativeIO.writeTextFileSync(outputPath, text);
  if (success) {
    NativeIO.writeStdout(`[Success] 已成功导出 Markdown: ${outputPath}`);
    return outputPath;
  } else {
    NativeIO.writeStderr(`[Error] 导出 Markdown 失败: ${outputPath}`);
    return null;
  }
}

/**
 * 批处理主入口
 */
export function recognizeImagesJXA(paths: string[]): string[] {
  const generatedFiles: string[] = [];
  for (const p of paths) {
    const res = processImageFile(p);
    if (res) {
      generatedFiles.push(res);
    }
  }
  return generatedFiles;
}

// ============================================================================
// 4. 自动判断运行环境与双流程入口控制
// ============================================================================

if (initJxaEnvironment()) {
  // --------------------------------------------------------------------------
  // 分支 A: 原生 JXA (osascript) 执行模式
  // --------------------------------------------------------------------------
  const inputPaths = NativeIO.getJxaArgs();
  if (inputPaths.length > 0) {
    recognizeImagesJXA(inputPaths);
  }
} else if (typeof process !== 'undefined' && process.argv) {
  // --------------------------------------------------------------------------
  // 分支 B: 开发模式 (npx tsx src/visionOcr.ts <image_path>)
  // 利用 process.mainModule 获取 Node 内部加载器，借助 esbuild 内存打包转译为
  // JXA 兼容的纯 JS 脚本，子进程拉起 osascript 执行，彻底解决 Node 缺乏 ObjC 作用域问题
  // --------------------------------------------------------------------------
  const mainModule = process.mainModule || (process as any).module;
  if (mainModule && typeof mainModule.require === 'function') {
    const cp = mainModule.require('child_process');
    const p = mainModule.require('path');
    const esbuild = mainModule.require('esbuild');

    const args = process.argv.slice(2);
    const scriptPath = p.resolve(process.argv[1]);

    try {
      // 内存构建打成单文件 IIFE 格式
      const buildResult = esbuild.buildSync({
        entryPoints: [scriptPath],
        bundle: true,
        write: false,
        format: 'iife',
        target: 'es2020',
        platform: 'neutral',
      });

      const compiledJs = buildResult.outputFiles[0].text;

      // 使用 '--' 作为分隔符，将命令行参数安全传递给 JXA 的 NSProcessInfo
      const osaArgs = ['-l', 'JavaScript', '-e', compiledJs, '--', scriptPath].concat(args);

      cp.execFileSync('osascript', osaArgs, {
        stdio: 'inherit',
      });
    } catch (err: any) {
      process.exit(err.status || 1);
    }
  }
}