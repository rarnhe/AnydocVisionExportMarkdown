import { 
  nativeParseArgs, 
  nativeFileExists, 
  nativeReadBinaryAsBase64, 
  nativeWriteTextFile, 
  nativeRemoveFile, 
  nativeJoinPath, 
  nativeGetTmpDir, 
  toNsString, 
  toJsString 
} from './cocoa-fs';
import { buildJscKernelScript } from '../jsc/jsc-runner';
import { revealInFinder } from './app-control';

export function runJxaMode(): void {
  const args = nativeParseArgs();
  const pdfPath = args[0];

  if (!pdfPath) {
    console.log('❌ 请指定输入的 PDF 文件路径。');
    return;
  }

  if (!nativeFileExists(pdfPath)) {
    console.log('❌ 输入的 PDF 文件不存在: ' + pdfPath);
    return;
  }

  const outputPath = pdfPath.toLowerCase().endsWith('.pdf') ? pdfPath.slice(0, -4) + '.md' : pdfPath + '.md';
  const wasmB64 = globalThis.__STATIC_WASM_B64__ || '';
  const glueCodeStr = globalThis.__STATIC_GLUE_CODE__ || '';
  const needsWasm = Boolean(wasmB64 && glueCodeStr);

  if (!needsWasm) {
    console.log('🤖 [Direct JXA Mode] 无需 WASM 计算，直接在 JXA 宿主环境内处理...');
    const resultText = `# Direct JXA Export\nSource File: ${pdfPath}\nExecuted without WASM / $.NSTask`;
    nativeWriteTextFile(outputPath, resultText);
    console.log('🎉 处理完成！结果已导出至: ' + outputPath);
    return;
  }

  console.log('⚡️ [JSC Offload Mode] 检测到 WASM 密集计算，正在通过 Cocoa $.NSTask 派生 Native JSC...');
  
  const pdfB64 = nativeReadBinaryAsBase64(pdfPath);
  const innerKernelScript = buildJscKernelScript(wasmB64, glueCodeStr, pdfB64);
  const tmpDir = nativeGetTmpDir();
  const innerRunnerPath = nativeJoinPath(
    tmpDir, 
    `jsc_inner_kernel_${Date.now()}_${Math.random().toString(36).slice(2)}.js`
  );

  nativeWriteTextFile(innerRunnerPath, innerKernelScript);

  const jscExecutable = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc';
  const pipe = $.NSPipe.pipe;
  const task = $.NSTask.alloc.init;

  task.setLaunchPath(toNsString(jscExecutable));
  const argsArray = $.NSMutableArray.alloc.init;
  argsArray.addObject(toNsString(innerRunnerPath));
  task.setArguments(argsArray);
  task.setStandardOutput(pipe);
  task.setStandardError(pipe);

  task.launch;
  const data = pipe.fileHandleForReading.readDataToEndOfFile;
  task.waitUntilExit;

  nativeRemoveFile(innerRunnerPath);

  const nsStrOutput = $.NSString.alloc.initWithDataEncoding(data, 4 /* NSUTF8StringEncoding */);
  const rawOutput = toJsString(nsStrOutput);

  if (rawOutput.indexOf('MARKDOWN_OUTPUT_START') !== -1) {
    const mdContent = rawOutput
      .split('MARKDOWN_OUTPUT_START')[1]
      .split('MARKDOWN_OUTPUT_END')[0]
      .trim();
    
    if (mdContent.length > 0) {
      nativeWriteTextFile(outputPath, mdContent);
      console.log('\n🎉 [WASM Offload] PDF 转换为 Markdown 成功！');
      console.log('💾 转换结果已保存至: ' + outputPath);
      
      // 可选调用 App 交互
      revealInFinder(outputPath);
    } else {
      console.log('\n⚠️ 转换完成，但导出的 Markdown 内容为空。JSC 输出:\n' + rawOutput);
    }
  } else {
    console.log('\n❌ Native JSC 引擎执行异常：\n' + rawOutput);
  }
}