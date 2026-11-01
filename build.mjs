import esbuild from 'esbuild';

esbuild.buildSync({
  entryPoints: ['src/test8_tsImportJs.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['esbuild'],
  banner: {
    js: '#!/usr/bin/osascript -l JavaScript',
  },
  outfile: 'dist/jxa_wasm_test.jxa.js',
});

console.log('✅ 打包成功：dist/jxa_wasm_test.jxa.js');