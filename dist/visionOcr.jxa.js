#!/usr/bin/osascript -l JavaScript
(() => {
  // src/visionOcr.ts
  var SUPPORTED_EXTENSIONS = /* @__PURE__ */ new Set([
    "png",
    "jpg",
    "jpeg",
    "tiff",
    "bmp",
    "heic",
    "webp"
  ]);
  function initJxaEnvironment() {
    if (typeof ObjC !== "undefined") {
      ObjC.import("stdlib");
      ObjC.import("Foundation");
      ObjC.import("AppKit");
      ObjC.import("Vision");
      return true;
    }
    return false;
  }
  var NativeIO = {
    /**
     * 展开波浪号 ~ 路径并规范化为绝对路径
     */
    expandTildePath(p) {
      return $(p).stringByExpandingTildeInPath.stringByStandardizingPath.js;
    },
    /**
     * 检查路径是否存在且为普通文件
     */
    isFileSync(p) {
      const fm = $.NSFileManager.defaultManager;
      const isDir = Ref();
      const exists = fm.fileExistsAtPathIsDirectory($(p), isDir);
      return exists && !isDir[0];
    },
    /**
     * 调用 macOS Vision 框架进行文本识别 (高精度 / Revision 3 / 0.01 最小高度)
     */
    performOcr(filePath, targetLang) {
      const fileURL = $.NSURL.fileURLWithPath($(filePath));
      const request = $.VNRecognizeTextRequest.alloc.init;
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
        const errDesc = error[0] ? error[0].localizedDescription.js : "\u672A\u77E5\u539F\u751F\u9519\u8BEF";
        this.writeStderr(`[VisionOCR Error] \u8BC6\u522B\u5931\u8D25 (${targetLang}): ${errDesc}`);
        return "";
      }
      const results = request.results;
      if (!results || results == $.nil) {
        return "";
      }
      const rawResults = results.js || results;
      const count = rawResults.length || (results.count ? results.count : 0);
      if (count === 0) {
        return "";
      }
      const fullTextLines = [];
      for (let i = 0; i < count; i++) {
        const observation = rawResults[i] || results.objectAtIndex && results.objectAtIndex(i);
        if (!observation || observation == $.nil) continue;
        const candidates = observation.topCandidates(1);
        if (!candidates || candidates == $.nil) continue;
        const topCandidate = candidates.js && candidates.js[0] || candidates.objectAtIndex && candidates.objectAtIndex(0);
        if (topCandidate && topCandidate != $.nil) {
          fullTextLines.push(topCandidate.string.js);
        }
      }
      return fullTextLines.join("\n");
    },
    /**
     * 将字符串写入目标文件 (UTF-8)
     */
    writeTextFileSync(outPath, content) {
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
    writeStderr(msg) {
      const data = $(`${msg}
`).dataUsingEncoding($.NSUTF8StringEncoding);
      $.NSFileHandle.fileHandleWithStandardError.writeData(data);
    },
    /**
     * 输出日志至 stdout
     */
    writeStdout(msg) {
      const data = $(`${msg}
`).dataUsingEncoding($.NSUTF8StringEncoding);
      $.NSFileHandle.fileHandleWithStandardOutput.writeData(data);
    },
    /**
     * 从 NSProcessInfo 获取命令行参数 (纯 JXA 模式)
     * 优先寻找 "--" 标记，截取其后的真实参数列表，并过滤掉脚本文件路径与选项
     */
    getJxaArgs() {
      const argsObj = $.NSProcessInfo.processInfo.arguments;
      const count = argsObj.count;
      const allArgs = [];
      for (let i = 0; i < count; i++) {
        allArgs.push(argsObj.objectAtIndex(i).js);
      }
      let userArgs = [];
      const dashDashIndex = allArgs.indexOf("--");
      if (dashDashIndex !== -1) {
        userArgs = allArgs.slice(dashDashIndex + 1);
      } else {
        userArgs = allArgs.length > 3 ? allArgs.slice(3) : [];
      }
      return userArgs.filter((arg) => {
        const lower = arg.toLowerCase();
        const isScriptFile = lower.endsWith(".ts") || lower.endsWith(".js") || lower.endsWith(".jxa");
        return !arg.startsWith("-") && !isScriptFile;
      });
    }
  };
  function isTraditionalChineseDominant(text) {
    if (!text) return false;
    const tradSample = /[繁體廣國會機關經濟進與實對學寶產關華區線點開]/g;
    const simpSample = /[简体广国会机关经济进与实对学宝产关华区线点开]/g;
    const tradMatches = (text.match(tradSample) || []).length;
    const simpMatches = (text.match(simpSample) || []).length;
    return tradMatches > simpMatches;
  }
  function processImageFile(rawPath) {
    const normalizedPath = NativeIO.expandTildePath(rawPath);
    if (!NativeIO.isFileSync(normalizedPath)) {
      NativeIO.writeStderr(`[Error] \u8DEF\u5F84\u65E0\u6548\u6216\u975E\u6B63\u5E38\u6587\u4EF6: ${normalizedPath}`);
      return null;
    }
    const extIndex = normalizedPath.lastIndexOf(".");
    const ext = extIndex !== -1 ? normalizedPath.slice(extIndex + 1).toLowerCase() : "";
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      NativeIO.writeStderr(
        `[Error] \u4E0D\u652F\u6301\u7684\u6587\u4EF6\u6269\u5C55\u540D (.${ext}): ${normalizedPath}`
      );
      return null;
    }
    let text = NativeIO.performOcr(normalizedPath, "zh-Hans");
    const isTraditional = isTraditionalChineseDominant(text);
    if (isTraditional) {
      text = NativeIO.performOcr(normalizedPath, "zh-Hant");
    }
    const basePath = extIndex !== -1 ? normalizedPath.slice(0, extIndex) : normalizedPath;
    const outputPath = isTraditional ? `${basePath}.zh-Hant.md` : `${basePath}.md`;
    const success = NativeIO.writeTextFileSync(outputPath, text);
    if (success) {
      NativeIO.writeStdout(`[Success] \u5DF2\u6210\u529F\u5BFC\u51FA Markdown: ${outputPath}`);
      return outputPath;
    } else {
      NativeIO.writeStderr(`[Error] \u5BFC\u51FA Markdown \u5931\u8D25: ${outputPath}`);
      return null;
    }
  }
  function recognizeImagesJXA(paths) {
    const generatedFiles = [];
    for (const p of paths) {
      const res = processImageFile(p);
      if (res) {
        generatedFiles.push(res);
      }
    }
    return generatedFiles;
  }
  if (initJxaEnvironment()) {
    const inputPaths = NativeIO.getJxaArgs();
    if (inputPaths.length > 0) {
      recognizeImagesJXA(inputPaths);
    }
  } else if (typeof process !== "undefined" && process.argv) {
    const mainModule = process.mainModule || process.module;
    if (mainModule && typeof mainModule.require === "function") {
      const cp = mainModule.require("child_process");
      const p = mainModule.require("path");
      const esbuild = mainModule.require("esbuild");
      const args = process.argv.slice(2);
      const scriptPath = p.resolve(process.argv[1]);
      try {
        const buildResult = esbuild.buildSync({
          entryPoints: [scriptPath],
          bundle: true,
          write: false,
          format: "iife",
          target: "es2020",
          platform: "neutral"
        });
        const compiledJs = buildResult.outputFiles[0].text;
        const osaArgs = ["-l", "JavaScript", "-e", compiledJs, "--", scriptPath].concat(args);
        cp.execFileSync("osascript", osaArgs, {
          stdio: "inherit"
        });
      } catch (err) {
        process.exit(err.status || 1);
      }
    }
  }
})();
