// src/visionOcr.js

const SUPPORTED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "tiff", "bmp", "heic", "webp"]);

/**
 * 快速判定繁体字是否占主要地位
 */
function isTraditionalChineseDominant(text) {
  if (!text) return false;

  const tradSample = /[繁體廣國會機關經濟進與實對學寶產關華區線點開]/g;
  const simpSample = /[简体广国会机关经济进与实对学宝产关华区线点开]/g;

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

  if (targetLang === "zh-Hant") {
    request.setRecognitionLanguages(["zh-Hant"]);
  } else {
    request.setRecognitionLanguages(["zh-Hans"]);
  }

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
    return null;
  }

  let text = performOcr(fileURL, "zh-Hans");
  let isTraditional = isTraditionalChineseDominant(text);

  if (isTraditional) {
    text = performOcr(fileURL, "zh-Hant");
  }

  const baseURL = fileURL.URLByDeletingPathExtension;
  const markdownURL = isTraditional 
    ? baseURL.URLByAppendingPathExtension("zh-Hant.md") 
    : baseURL.URLByAppendingPathExtension("md");

  const nsText = $.NSString.stringWithString(text);
  let writeError = Ref();
  const success = nsText.writeToURLAtomicallyEncodingError(
    markdownURL,
    true,
    $.NSUTF8StringEncoding,
    writeError
  );

  return success ? markdownURL.path.js : null;
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
    return null;
  }

  if (isDir[0]) {
    console.error(`暂不支持处理文件夹路径: ${nsPathStr.js}`);
    return null;
  }

  return processImageFileURL(fileURL);
}

/**
 * 批量处理接口（绑定到全局作用域）
 */
function recognizeImagesJXA(paths) {
  if (!Array.isArray(paths)) paths = [paths];
  const exportedFiles = [];
  for (const p of paths) {
    const res = processPath(p);
    if (res) exportedFiles.push(res);
  }
  return exportedFiles;
}