#!/usr/bin/osascript -l JavaScript

ObjC.import("stdlib");
ObjC.import("Foundation");
ObjC.import("AppKit");
ObjC.import("PDFKit");

// ---------------------------------------------------------------------------
// 1. 动态注入同目录下的 pdfSplitter_call.js
// ---------------------------------------------------------------------------
(function loadModule() {
  const scriptPath = $.NSProcessInfo.processInfo.arguments.objectAtIndex(3).stringByDeletingLastPathComponent;
  const libPath = scriptPath.stringByAppendingPathComponent("pdfSplitter_call.js");
  
  let err = Ref();
  const code = $.NSString.stringWithContentsOfFileEncodingError(libPath, $.NSUTF8StringEncoding, err);
  if (!code.js) {
    const data = $(`无法加载库文件: ${libPath.js}\n`).dataUsingEncoding($.NSUTF8StringEncoding);
    $.NSFileHandle.fileHandleWithStandardError.writeData(data);
    $.exit(1);
  }
  
  // 使用 (0, eval) 保证在 Global Scope 下无缝注入函数
  (0, eval)(code.js);
})();

// ---------------------------------------------------------------------------
// 2. 日志与 CLI 解析逻辑
// ---------------------------------------------------------------------------

const scriptName = $.NSProcessInfo.processInfo.arguments.objectAtIndex(3).lastPathComponent.js;

console.error = function (obj) {
  const data = $(`${obj}\n`).dataUsingEncoding($.NSUTF8StringEncoding);
  $.NSFileHandle.fileHandleWithStandardError.writeData(data);
};

function usage() {
  console.log(`用法: ${scriptName} <pdfFilePath> <ocrConfigObject> [选项]

参数:
  pdfFilePath      要拆分的源 PDF 文件路径
  ocrConfigObject  JS 对象或 JSON 格式，例如: "{ code: 'needsOcr', pages: [ 12, 17, 20 ], pageCount: 56 }"

选项:
  -h, --help       显示帮助信息
  --out-dir <DIR>  设置输出目录 (默认: 与 PDF 同级的同名文件夹)
  --dpi <VALUE>    设置 PNG 渲染 DPI (默认: 200)`);
}

function run(args) {
  let positionalArgs = [];
  let outDirOption = null;
  let dpi = 200;

  let i = 0;
  while (i < args.length) {
    const opt = args[i];
    switch (opt) {
      case "-h":
      case "--help":
        usage();
        $.exit(0);

      case "--out-dir":
        if (!args[i + 1]) {
          console.error(`${scriptName}: 选项 --out-dir 需要参数`);
          $.exit(1);
        }
        outDirOption = args[i + 1];
        i += 1;
        break;

      case "--dpi":
        if (!args[i + 1]) {
          console.error(`${scriptName}: 选项 --dpi 需要参数`);
          $.exit(1);
        }
        dpi = parseInt(args[i + 1], 10) || 200;
        i += 1;
        break;

      default:
        if (opt.startsWith("-")) {
          console.error(`${scriptName}: 未知选项 -- '${opt}'`);
          $.exit(1);
        } else {
          positionalArgs.push(opt);
        }
        break;
    }
    i += 1;
  }

  if (positionalArgs.length < 2) {
    console.error(`${scriptName}: 参数不足，需要提供 PDF 文件路径与 OCR 配置对象`);
    console.error(`尝试 '${scriptName} --help' 获取详细信息。`);
    $.exit(1);
  }

  const rawPdfPath = positionalArgs[0];
  const ocrConfigString = positionalArgs[1];

  try {
    // 调用已全局注入的 splitPdfJXA 核心 API
    const outputDir = splitPdfJXA(rawPdfPath, ocrConfigString, {
      outDir: outDirOption,
      dpi: dpi,
    });

    console.log(`处理成功！切分结果及清单已输出至: ${outputDir}`);
  } catch (err) {
    console.error(`执行过程中出错: ${err.message || err}`);
    $.exit(1);
  }
}