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
declare const module: any;
declare const process: any;

const SUPPORTED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'tiff', 'bmp', 'heic', 'webp']);

// ============================================================================
// 2. 繁简判定辅助函数
// ============================================================================
export function isTraditionalChineseDominant(text: string): boolean {
  if (!text) return false;
  const tradSample = /[繁體廣國會機關經濟進與實對學寶產關華區線點開]/g;
  const simpSample = /[简体广国会机关经济进与实对学宝产关华区线点开]/g;
  const tradMatches = (text.match(tradSample) || []).length;
  const simpMatches = (text.match(simpSample) || []).length;
  return tradMatches > simpMatches;
}

// ============================================================================
// 3. 自包含 Vision OCR 函数 (核心：可直接序列化给 @jxa/run 或在 JXA 中运行)
// ============================================================================
export function performVisionOcr(filePath: string, targetLang: 'zh-Hans' | 'zh-Hant'): string {
  if (typeof ObjC !== 'undefined') {
    ObjC.import('Foundation');
    ObjC.import('AppKit');
    ObjC.import('Vision');
  } else {
    return '';
  }

  let VNRecognizeTextRequestClass: any = null;
  let VNImageRequestHandlerClass: any = null;

  if (typeof $ !== 'undefined') {
    VNRecognizeTextRequestClass = $.VNRecognizeTextRequest;
    VNImageRequestHandlerClass = $.VNImageRequestHandler;
  }
  if (!VNRecognizeTextRequestClass && typeof ObjC !== 'undefined' && ObjC.classes) {
    VNRecognizeTextRequestClass = ObjC.classes.VNRecognizeTextRequest;
    VNImageRequestHandlerClass = ObjC.classes.VNImageRequestHandler;
  }

  if (!VNRecognizeTextRequestClass || !VNImageRequestHandlerClass) {
    return '';
  }

  const fileURL = $.NSURL.fileURLWithPath($(filePath));
  const request = VNRecognizeTextRequestClass.alloc.init;

  request.setRecognitionLevel($.VNRequestTextRecognitionLevelAccurate);
  request.setUsesLanguageCorrection(true);
  request.setRevision(3);
  request.setMinimumTextHeight(0.01);
  request.setRecognitionLanguages($([targetLang]));

  const requestHandler = VNImageRequestHandlerClass.alloc.initWithURLOptions(
    fileURL,
    $({})
  );

  const error = Ref();
  const success = requestHandler.performRequestsError($([request]), error);

  if (!success) return '';

  const results = request.results;
  if (!results || results == $.nil) return '';

  const rawResults = results.js || results;
  const count = rawResults.length || (results.count ? results.count : 0);
  if (count === 0) return '';

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
}

// ============================================================================
// 4. Node.js 逻辑层 (使用标准 require，死代码消除会自动处理)
// ============================================================================
export async function processImageNode(rawPath: string): Promise<string | null> {
  // 当 IS_JXA_BUILD 为 true 时，这整段函数会被 esbuild 识别为死代码并剔除
  if (typeof IS_JXA_BUILD !== 'undefined' && IS_JXA_BUILD) {
    return null;
  }

  // 直接使用标准 require，没有任何 eval
  const fs = require('fs');
  const path = require('path');
  const { run: runJxa } = require('@jxa/run');

  const absPath = path.resolve(rawPath);
  if (!fs.existsSync(absPath)) return null;

  const ext = path.extname(absPath).slice(1).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) return null;

  let text = (await runJxa(performVisionOcr, absPath, 'zh-Hans')) as string;
  const isTraditional = isTraditionalChineseDominant(text);

  if (isTraditional) {
    text = (await runJxa(
      (p: string) => performVisionOcr(p, 'zh-Hant'),
      absPath
    )) as string;
  }

  const parsed = path.parse(absPath);
  const outName = isTraditional ? `${parsed.name}.zh-Hant.md` : `${parsed.name}.md`;
  const outPath = path.join(parsed.dir, outName);

  fs.writeFileSync(outPath, text, 'utf-8');
  console.log(`[Node Success] Output: ${outPath}`);
  return outPath;
}

// ============================================================================
// 5. 纯 JXA 原生文件系统辅助接口 (仅在 JXA 环境中使用)
// ============================================================================
export const NativeIO = {
  expandTildePath(p: string): string {
    return $(p).stringByExpandingTildeInPath.stringByStandardizingPath.js;
  },
  isFileSync(p: string): boolean {
    const fm = $.NSFileManager.defaultManager;
    const isDir = Ref();
    const exists = fm.fileExistsAtPathIsDirectory($(p), isDir);
    return exists && !isDir[0];
  },
  getExtension(filePath: string): string {
    const ext = $(filePath).pathExtension.js;
    return typeof ext === 'string' ? ext.toLowerCase() : '';
  },
  removeExtension(filePath: string): string {
    return $(filePath).stringByDeletingPathExtension.js;
  },
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
  }
};

// ============================================================================
// 6. 环境分流入口
// ============================================================================

// --- 分支 A: 纯 JXA 入口 ---
if (typeof IS_JXA_BUILD !== 'undefined' && IS_JXA_BUILD) {
  if (typeof ObjC !== 'undefined') {
    ObjC.import('stdlib');
    ObjC.import('Foundation');
    ObjC.import('AppKit');
    ObjC.import('Vision');
  }

  (globalThis as any).run = function (argv: string[]) {
    if (!argv || argv.length === 0) return '请传入图片路径';

    const results: string[] = [];

    for (const rawPath of argv) {
      const fullPath = NativeIO.expandTildePath(rawPath);
      if (!NativeIO.isFileSync(fullPath)) continue;

      const ext = NativeIO.getExtension(fullPath);
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

      let text = performVisionOcr(fullPath, 'zh-Hans');
      const isTraditional = isTraditionalChineseDominant(text);

      if (isTraditional) {
        text = performVisionOcr(fullPath, 'zh-Hant');
      }

      const basePath = NativeIO.removeExtension(fullPath);
      const outputPath = isTraditional ? `${basePath}.zh-Hant.md` : `${basePath}.md`;

      if (NativeIO.writeTextFileSync(outputPath, text)) {
        results.push(outputPath);
      }
    }

    return `JXA OCR 处理完成: ${results.join(', ')}`;
  };
}

// --- 分支 B: Node.js CLI 入口 ---
if (typeof IS_JXA_BUILD === 'undefined' || !IS_JXA_BUILD) {
  const isDirectRun =
    (typeof process !== 'undefined' && process.argv[1]?.endsWith('visionOcr.node.js')) ||
    (typeof process !== 'undefined' && process.argv[1]?.endsWith('visionOcr.ts'));

  if (isDirectRun) {
    const args = process.argv.slice(2);
    if (args.length > 0) {
      (async () => {
        for (const p of args) {
          await processImageNode(p);
        }
      })();
    }
  }
}