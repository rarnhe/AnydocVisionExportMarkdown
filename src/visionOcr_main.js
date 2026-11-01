#!/usr/bin/osascript -l JavaScript

ObjC.import("stdlib");
ObjC.import("Foundation");
ObjC.import("AppKit");
ObjC.import("Vision");

// 修正：强制在全局作用域下 eval 脚本代码
(function loadModule() {
  const scriptPath = $.NSProcessInfo.processInfo.arguments.objectAtIndex(3).stringByDeletingLastPathComponent;
  const libPath = scriptPath.stringByAppendingPathComponent("visionOcr_call.js");
  
  let err = Ref();
  const code = $.NSString.stringWithContentsOfFileEncodingError(libPath, $.NSUTF8StringEncoding, err);
  if (!code.js) {
    const data = $(`无法加载库文件: ${libPath.js}\n`).dataUsingEncoding($.NSUTF8StringEncoding);
    $.NSFileHandle.fileHandleWithStandardError.writeData(data);
    $.exit(1);
  }
  
  // 使用 (0, eval) 语法保证在 Global Scope 下注入函数与变量
  (0, eval)(code.js);
})();

const scriptName = $.NSProcessInfo.processInfo.arguments.objectAtIndex(3).lastPathComponent.js;

console.error = (obj) => {
  const data = $(`${obj}\n`).dataUsingEncoding($.NSUTF8StringEncoding);
  $.NSFileHandle.fileHandleWithStandardError.writeData(data);
};

function usage() {
  console.log(`用法: ${scriptName} <image1> [image2 ...]

说明:
  接收图片文件路径，使用原生 Vision 极速通道进行 OCR 识别。
  - 默认使用中文简体识别。
  - 若识别出繁体字为主，自动切换至繁体识别并输出带有 .zh-Hant.md 后缀的文件。
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

  // 此时 recognizeImagesJXA 已成功挂载在全局
  const generatedFiles = recognizeImagesJXA(paths);

  if (generatedFiles.length > 0) {
    for (const filePath of generatedFiles) {
    //   console.log(`-> ${filePath}`); //如果是被index.ts调用则关闭
    }
  } else {
    $.exit(1);
  }
}