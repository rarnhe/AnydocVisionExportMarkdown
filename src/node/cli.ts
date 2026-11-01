import * as fs from 'fs';
import * as path from 'path';
import * as esbuild from 'esbuild';
import * as cp from 'child_process';

export function runNodeMode(): void {
  const args = process.argv.slice(2);
  const targetPdf = args[0] ? path.resolve(args[0]) : path.resolve(__dirname, '../../chunk_1.pdf');

  if (!fs.existsSync(targetPdf)) {
    console.error('❌ PDF 文件不存在: ' + targetPdf);
    process.exit(1);
  }

  console.log('🔍 [Node 开发调试] 动态准备 WASM 模块与胶水层...');
  
  let wasmPkgPath: string;
  try {
    wasmPkgPath = require.resolve('@firecrawl/anydoc-wasm');
  } catch (e) {
    wasmPkgPath = path.resolve(
      process.cwd(),
      'node_modules/@firecrawl/anydoc-wasm/anydoc_wasm.js'
    );
  }

  const pkgDir = path.dirname(wasmPkgPath);
  const wasmFilePath = path.join(pkgDir, 'anydoc_wasm_bg.wasm');
  let glueJsPath = path.join(pkgDir, 'anydoc_wasm.js');
  if (!fs.existsSync(glueJsPath)) {
    glueJsPath = path.join(pkgDir, 'anydoc_wasm_bg.js');
  }

  const wasmB64 = fs.readFileSync(wasmFilePath).toString('base64');
  const rawGlueCode = fs.readFileSync(glueJsPath, 'utf-8');

  // 使用 esbuild 将胶水层打包为 IIFE 格式，并定义全局 WasmGlue
  const transformResult = esbuild.transformSync(rawGlueCode, {
    loader: 'js',
    target: 'es2020',
    format: 'iife',
    globalName: 'WasmGlue',
  });

  // 定位编译后的 JXA 主入口文件路径
  const jxaMainEntry = path.resolve(__dirname, '../jxa/jxa-main.ts');
  
  const buildResult = esbuild.buildSync({
    entryPoints: [jxaMainEntry],
    bundle: true,
    write: false,
    platform: 'neutral',
    format: 'iife',
    define: {
      'process.env.BUILD_TARGET': '"jxa"',
      'globalThis.__STATIC_WASM_B64__': JSON.stringify(wasmB64),
      '__STATIC_WASM_B64__': JSON.stringify(wasmB64),
      'globalThis.__STATIC_GLUE_CODE__': JSON.stringify(transformResult.code),
      '__STATIC_GLUE_CODE__': JSON.stringify(transformResult.code),
    },
  });

  const bundledCode = buildResult.outputFiles[0].text;
  const tmpRunnerPath = path.join(
    '/tmp', 
    `anydoc_runner_${Date.now()}_${Math.random().toString(36).slice(2)}.js`
  );
  
  fs.writeFileSync(tmpRunnerPath, bundledCode, 'utf-8');
  console.log('⚡️ [Node 开发调试] 调起 osascript 执行静态打包后的临时 Bundle...');

  const osaArgs = ['-l', 'JavaScript', tmpRunnerPath, '--', targetPdf];
  try {
    cp.execFileSync('osascript', osaArgs, { stdio: 'inherit' });
  } catch (e: any) {
    console.error('❌ osascript 执行发生异常:', e.message);
  } finally {
    if (fs.existsSync(tmpRunnerPath)) {
      fs.unlinkSync(tmpRunnerPath);
    }
  }
}

const isNode = typeof process !== 'undefined' && Boolean(process.versions && process.versions.node);
if (isNode && require.main === module) {
  runNodeMode();
}