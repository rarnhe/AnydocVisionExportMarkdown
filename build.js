const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

try {
  const pkgDir = path.dirname(require.resolve('@firecrawl/anydoc-wasm'));
  const wasmSource = path.join(pkgDir, 'anydoc_wasm_bg.wasm');
  const glueSource = ['anydoc_wasm.js', 'anydoc_wasm_bg.js'].map(n => path.join(pkgDir,n)).find(fs.existsSync);
  if (!glueSource || !fs.existsSync(wasmSource)) throw new Error('AnyDoc WASM assets missing');
  fs.mkdirSync('dist', {recursive:true});
  // External asset: no PDF or WASM binary is embedded in the generated JS.
  fs.copyFileSync(wasmSource, 'dist/anydoc_core.wasm');
  const glueCode = esbuild.transformSync(fs.readFileSync(glueSource,'utf8'), {
    loader:'js', target:'es2020', format:'iife', globalName:'WasmGlue'
  }).code;
  esbuild.buildSync({
    entryPoints:['src/jxa/jxa-main.ts'], bundle:true,
    outfile:'dist/anydoc-wasm.jxa.js', platform:'neutral', format:'iife',
    external:['fs','path','child_process'],
    banner:{js:'#!/usr/bin/osascript -l JavaScript'},
    define:{
      'process.env.BUILD_TARGET':'"jxa"',
      'globalThis.__STATIC_GLUE_CODE__':JSON.stringify(glueCode),
      '__STATIC_GLUE_CODE__':JSON.stringify(glueCode)
    }
  });
  fs.chmodSync('dist/anydoc-wasm.jxa.js',0o755);
  console.log('Built dist/anydoc-wasm.jxa.js and dist/anydoc_core.wasm');
} catch (e) { console.error(e); process.exitCode=1; }
