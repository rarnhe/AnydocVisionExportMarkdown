#!/usr/bin/osascript -l JavaScript

ObjC.import("stdlib");
ObjC.import("Foundation");
ObjC.import("AppKit");
ObjC.import("Vision");

const scriptName = $.NSProcessInfo.processInfo.arguments.objectAtIndex(3).lastPathComponent.js;

console.error = (obj) => {
  const data = $(`${obj}\n`).dataUsingEncoding($.NSUTF8StringEncoding);
  $.NSFileHandle.fileHandleWithStandardError.writeData(data);
};

// 支持的图片扩展名集合
const SUPPORTED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "tiff", "bmp", "heic", "webp"]);

/**
 * 快速判定繁体字是否占主要地位
 */
function isTraditionalChineseDominant(text) {
  if (!text) return false;

  const tradSample = /[繁體廣國會機關經濟進與實對學寶產關華區線點開]/g;
  const simpSample = /[简体国会机关经济进与实对学宝产关华区线点开]/g;

  const tradMatches = (text.match(tradSample) || []).length;
  const simpMatches = (text.match(simpSample) || []).length;

  return tradMatches > simpMatches;
}

/**
 * 极致优化的图片 OCR 函数（直连 URL 零拷贝）
 */
function performOcr(fileURL, targetLang) {
  const request = $.VNRecognizeTextRequest.alloc.init;
  request.setRecognitionLevel($.VNRequestTextRecognitionLevelAccurate);
  request.setUsesLanguageCorrection = true;

  // 剔除日文/英文，仅保留简体/繁体中文
  if (targetLang === "zh-Hant") {
    request.setRecognitionLanguages(["zh-Hant"]);
  } else {
    request.setRecognitionLanguages(["zh-Hans"]);
  }

  // 直接将图片 URL 传给 VNImageRequestHandler，无需内存加载与重绘
  const requestHandler = $.VNImageRequestHandler.alloc.initWithURLOptions(fileURL, $({}));
  let error = Ref();
  const success = requestHandler.performRequestsError($([request]), error);

  if (!success) {
    console.error(`识别文件失败: ${fileURL.path.js}`);
    return "";
  }

  if (!request.results || !request.results.js) return "";

  return request.results.js
    .map((result) => result.topCandidates(1).objectAtIndex(0).string.js)
    .join("\n");
}

/**
 * 处理单张图片：OCR -> 繁简检测 -> 导出 Markdown
 */
function processImageFileURL(fileURL) {
  const ext = fileURL.pathExtension.js.toLowerCase();

  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    console.error(`不支持的文件格式 (${ext}): ${fileURL.lastPathComponent.js}`);
    return;
  }

  // const fileName = fileURL.lastPathComponent.js;
  // console.log(`正在处理: ${fileName}...`);

  // 1. 默认使用简体中文识别
  let text = performOcr(fileURL, "zh-Hans");
  let isTraditional = isTraditionalChineseDominant(text);

  // 2. 若繁体占主要地位，使用繁体引擎重计算
  if (isTraditional) {
    text = performOcr(fileURL, "zh-Hant");
  }

  // 3. 构建与图片同一路径的同名 Markdown 文件路径
  const baseURL = fileURL.URLByDeletingPathExtension;
  const markdownURL = isTraditional 
    ? baseURL.URLByAppendingPathExtension("zh-Hant.md") 
    : baseURL.URLByAppendingPathExtension("md");

  // 4. 写入文件（修正了 JXA Bridge 的 Objective-C API 方法签名）
  const nsText = $.NSString.stringWithString(text);
  let writeError = Ref();
  const success = nsText.writeToURLAtomicallyEncodingError(
    markdownURL,
    true,
    $.NSUTF8StringEncoding,
    writeError
  );

  if (success) {
    // console.log(`-> 已导出: ${markdownURL.path.js}`);
  } else {
    console.error(`-> 写入 Markdown 失败: ${markdownURL.path.js}`);
  }
}

/**
 * 校验路径并仅处理单张图片
 */
function processPath(rawPath) {
  const nsPathStr = $(rawPath).stringByExpandingTildeInPath.stringByStandardizingPath;
  const fileURL = $.NSURL.fileURLWithPath(nsPathStr);
  const fm = $.NSFileManager.defaultManager;

  let isDir = Ref();
  const exists = fm.fileExistsAtPathIsDirectory(nsPathStr, isDir);

  if (!exists) {
    console.error(`路径不存在: ${nsPathStr.js}`);
    return;
  }

  if (isDir[0]) {
    console.error(`暂不支持处理文件夹路径: ${nsPathStr.js}`);
    return;
  }

  processImageFileURL(fileURL);
}

function usage() {
  console.log(`用法: ${scriptName} <image1> [image2 ...]

说明:
  接收图片文件路径，使用原生 Vision 极速通道进行 OCR。
  - 默认使用中文简体。
  - 若识别出繁体字为主，自动切换至繁体识别并输出带有 _zh-Hant 后缀的 .md 文件。
  - 导出 Markdown 文件与原图片放置在同一目录下。`);
}

function run(args) {
  let paths = [];

  let i = 0;
  while (i < args.length) {
    const opt = args[i];
    switch (opt) {
      case "-h":
      case "--help":
        usage();
        $.exit(0);

      case "--":
      case "-":
        paths = [...paths, ...args.slice(i + 1)];
        i = args.length;
        break;

      default:
        if (opt.startsWith("-")) {
          console.error(`${scriptName}: 未知选项 -- '${opt.replace(/^-*/, "")}'`);
          $.exit(1);
        } else {
          paths.push(opt);
        }
        break;
    }
    i += 1;
  }

  if (!paths.length) {
    console.error(`${scriptName}: 参数不足，请提供至少一个图片路径`);
    console.error(`尝试 '${scriptName} --help' 获取更多信息。`);
    $.exit(1);
  }

  for (const p of paths) {
    processPath(p);
  }
}