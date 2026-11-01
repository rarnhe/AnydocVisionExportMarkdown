import * as esbuild from 'esbuild';
import fs from 'fs';

// 将 .wasm 内联转为 Base64 字符串的插件
const wasmBase64Plugin = {
  name: 'wasm-base64',
  setup(build) {
    build.onLoad({ filter: /\.wasm$/ }, async (args) => {
      const buffer = await fs.promises.readFile(args.path);
      return {
        contents: `export default "${buffer.toString('base64')}";`,
        loader: 'js',
      };
    });
  },
};

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  outfile: 'dist/main.jxa.js',
  platform: 'neutral',       // 关键：阻止注入 Node.js 垫片
  target: 'es2020',
  format: 'iife',
  treeShaking: true,         // 强制 Tree-shaking 剔除未调用的 Node 分支
  define: {
    'process.env.NODE_ENV': '"production"',
    '__BUILD_TARGET__': '"jxa"',
  },
  plugins: [wasmBase64Plugin],
  banner: {
    js: `#!/usr/bin/osascript -l JavaScript
ObjC.import('stdlib');
ObjC.import('Foundation');
ObjC.import('AppKit');
ObjC.import('Vision');
ObjC.import('Quartz');
`,
  },
  footer: {
    js: `
function run(argv) {
  if (argv.length > 0) {
    var pdfPath = argv[0];
    runPipelineJXA(pdfPath);
  } else {
    console.log('用法: osascript -l JavaScript main.jxa.js <input_pdf_path>');
  }
}
`,
  },
});
console.log('⚡ JXA 单文件产物构建完成: dist/main.jxa.js');