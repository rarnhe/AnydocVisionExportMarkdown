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
    if (!results || results == $.nil) {
      return '';
    }

    const rawResults = results.js || results;
    const count = rawResults.length || (results.count ? results.count : 0);
    if (count === 0) {
      return '';
    }

    const fullTextLines: string[] = [];
    for (let i = 0; i < count; i++) {
      const observation = rawResults[i] || (results.objectAtIndex && results.objectAtIndex(i));
      if (!observation || observation == $.nil) continue;

      const candidates = observation.topCandidates(1);
      if (!candidates || candidates == $.nil) continue;

      const topCandidate = (candidates.js && candidates.js[0]) || (candidates.objectAtIndex && candidates.objectAtIndex(0));
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
   * 输出结构化数据至 stdout（专供管道捕获）
   */
  writeStdout(msg: string): void {
    const data = $(`${msg}\n`).dataUsingEncoding($.NSUTF8StringEncoding);
    $.NSFileHandle.fileHandleWithStandardOutput.writeData(data);
  },

  /**
   * 从 NSProcessInfo 获取命令行参数 (纯 JXA 模式)
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
      userArgs = allArgs.length > 3 ? allArgs.slice(3) : [];
    }

    return userArgs.filter((arg) => {
      const lower = arg.toLowerCase();
      const isScriptFile = lower.endsWith('.ts') || lower.endsWith('.js') || lower.endsWith('.jxa');
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
 * 处理单张图片 OCR 流程
 */
export function processImageFile(rawPath: string): string | null {
  const normalizedPath = NativeIO.expandTildePath(rawPath);
  if (!NativeIO.isFileSync(normalizedPath)) {
    NativeIO.writeStderr(`[Error] 路径无效或非正常文件: ${normalizedPath}`);
    return null;
  }

  const extIndex = normalizedPath.lastIndexOf('.');
  const ext = extIndex !== -1 ? normalizedPath.slice(extIndex + 1).toLowerCase() : '';
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    NativeIO.writeStderr(`[Error] 不支持的文件扩展名 (.${ext}): ${normalizedPath}`);
    return null;
  }

  // 1. 优先采用简体中文识别
  let text = NativeIO.performOcr(normalizedPath, 'zh-Hans');
  const isTraditional = isTraditionalChineseDominant(text);

  // 2. 若检测到繁体为主，切换繁体引擎二次识别
  if (isTraditional) {
    text = NativeIO.performOcr(normalizedPath, 'zh-Hant');
  }

  // 3. 构建输出 Markdown 文件路径
  const basePath = extIndex !== -1 ? normalizedPath.slice(0, extIndex) : normalizedPath;
  const outputPath = isTraditional ? `${basePath}.zh-Hant.md` : `${basePath}.md`;

  // 4. 写入 Markdown
  const success = NativeIO.writeTextFileSync(outputPath, text);
  if (success) {
    return outputPath;
  } else {
    NativeIO.writeStderr(`[Error] 导出 Markdown 失败: ${outputPath}`);
    return null;
  }
}

/**
 * 批处理主入口（输出结构化 JSON 格式供管道消费）
 */
export function recognizeImagesJXA(paths: string[]): void {
  const generatedFiles: string[] = [];
  for (const p of paths) {
    const res = processImageFile(p);
    if (res) {
      generatedFiles.push(res);
      NativeIO.writeStderr(`[Success] 已成功导出 Markdown: ${res}`);
    }
  }

  // 关键：通过标准输出返回结构化 JSON 管道数据
  const pipelineResult = {
    status: 'success',
    exportedFiles: generatedFiles,
  };
  NativeIO.writeStdout(`OCR_RESULT_JSON_START${JSON.stringify(pipelineResult)}OCR_RESULT_JSON_END`);
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
  // 分支 B: 开发/CLI 模式 (Node 外壳安全隔离)
  // --------------------------------------------------------------------------
  const isMain = typeof require !== 'undefined' && require.main === module;
  if (isMain) {
    // 直接使用标准 require，因为已在 esbuild 中声明 external，不会引发静态打包错误
    const cp = require('child_process');
    const path = require('path');
    const fs = require('fs');
    const os = require('os');
    const esbuild = require('esbuild');

    const args = process.argv.slice(2);
    const scriptPath = path.resolve(__filename);

    if (args.length === 0) {
      console.error('❌ 请指定至少一个图片文件路径。');
      process.exit(1);
    }

    let tmpRunnerPath: string = '';
    try {
      // 1. 打包时声明 external，将 Node 内置模块和 esbuild 排除在静态打包之外
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
      tmpRunnerPath = path.join(tmpDir, `ocr_runner_${Date.now()}_${Math.random().toString(36).slice(2)}.js`);
      
      fs.writeFileSync(tmpRunnerPath, compiledJs, 'utf-8');

      // 2. 调用 osascript 执行临时文件，并通过 '--' 传递用户参数
      const osaArgs = ['-l', 'JavaScript', tmpRunnerPath, '--'].concat(args);
      
      console.log('⚡️ [Node 壳] 正在调用 osascript 执行 OCR 任务...');
      const stdout = cp.execFileSync('osascript', osaArgs, {
        encoding: 'utf-8',
        maxBuffer: 1024 * 1024 * 50,
      });

      // 3. 提取结构化输出管道数据
      if (stdout.includes('OCR_RESULT_JSON_START')) {
        const jsonStr = stdout.split('OCR_RESULT_JSON_START')[1].split('OCR_RESULT_JSON_END')[0].trim();
        const resultData = JSON.parse(jsonStr);
        
        console.log('\n🎉 OCR 批处理完成！');
        console.log('📦 结构化管道输出结果:', resultData);
      } else {
        console.log(stdout);
      }

    } catch (err: any) {
      console.error('❌ 执行发生异常:', err.message || err);
      process.exit(1);
    } finally {
      // 4. 清理临时落盘文件
      if (tmpRunnerPath && fs.existsSync(tmpRunnerPath)) {
        try {
          fs.unlinkSync(tmpRunnerPath);
        } catch {}
      }
    }
  }
}