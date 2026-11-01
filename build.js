const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

try {
  const pkgDir = path.dirname(require.resolve('@firecrawl/anydoc-wasm'));
  const wasmFilePath = path.join(pkgDir, 'anydoc_wasm_bg.wasm');
  let glueJsPath = path.join(pkgDir, 'anydoc_wasm.js');
  if (!fs.existsSync(glueJsPath)) {
    glueJsPath = path.join(pkgDir, 'anydoc_wasm_bg.js');
  }

  console.log('📦 正在读取并转换 WASM 及胶水代码...');
  const wasmB64 = fs.readFileSync(wasmFilePath).toString('base64');
  const rawGlue = fs.readFileSync(glueJsPath, 'utf-8');

  const glueCode = esbuild.transformSync(rawGlue, {
    loader: 'js',
    target: 'es2020',
    format: 'iife',
    globalName: 'WasmGlue',
  }).code;

  if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist', { recursive: true });
  }

  console.log('⚡️ 正在使用 esbuild 打包 JXA Bundle...');
  esbuild.buildSync({
    entryPoints: ['src/jxa/jxa-main.ts'], // 指向新架构的 JXA 入口
    bundle: true,
    outfile: 'dist/anydoc-wasm.jxa.js',
    platform: 'neutral',
    format: 'iife',
    mainFields: ['module', 'main'],
    external: ['fs', 'path', 'child_process', 'esbuild', '@jxa/run'],
    banner: {
      js: '#!/usr/bin/osascript -l JavaScript',
    },
    define: {
      'process.env.BUILD_TARGET': '"jxa"',
      'globalThis.__STATIC_WASM_B64__': JSON.stringify(wasmB64),
      'globalThis.__STATIC_GLUE_CODE__': JSON.stringify(glueCode),
      '__STATIC_WASM_B64__': JSON.stringify(wasmB64),
      '__STATIC_GLUE_CODE__': JSON.stringify(glueCode),
    },
  });

  fs.chmodSync('dist/anydoc-wasm.jxa.js', 0o755);
  console.log('🎉 编译成功！输出文件: dist/anydoc-wasm.jxa.js');
} catch (err) {
  console.error('❌ 编译失败:', err);
  process.exit(1);
}