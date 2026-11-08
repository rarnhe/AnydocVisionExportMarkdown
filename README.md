# AnyDocVisionExportMarkdown

macOS 下基于 TypeScript、JXA、Objective-C Foundation 与 `@firecrawl/anydoc-wasm` 的 PDF → Markdown 工具。正式运行交付物是**独立 JXA JavaScript**，无需 Node、npm、JSC 子进程或外置 WASM 文件。

## 两种输入模式

仅接收**一个输入路径**：一个 PDF 文件，或一个需要递归处理的文件夹。**不支持多个 PDF 路径串行输入，也不支持 `--output-dir`。**

### 单个 PDF

```bash
./dist/anydoc-wasm.jxa.js /path/to/report.pdf
```

输出位于 PDF 所在目录。已有文件不会被覆盖，自动使用第一个空闲编号：

```text
report.pdf
report.md
report-1.md
report-2.md
```

首次生成 `report.md`；再次运行生成 `report-1.md`；第三次运行生成 `report-2.md`，依此类推。扩展名 `.PDF` 也支持。

### 递归处理一个文件夹

```bash
./dist/anydoc-wasm.jxa.js /path/to/Reports
```

每次运行均在**输入目录同级**创建一个新的 Markdown 镜像目录。若目录已存在，则从 **空格 + 2** 开始依次编号：

```text
Reports/
├── a.pdf
└── nested/
    └── b.PDF
Reports_md/
├── a.md
└── nested/
    └── b.md
Reports_md 2/
├── a.md
└── nested/
    └── b.md
Reports_md 3/
├── a.md
└── nested/
    └── b.md
```

递归识别大小写不敏感的 PDF 扩展名；忽略其他文件及符号链接。**每次处理一个文件夹，不接受多个文件夹或文件路径列表。** 不覆盖已有输出文件。

## 开发与构建

要求 macOS、Node.js 24+（仅开发和 CI）：

```bash
npm ci
npm run doctor
npm run typecheck
npm run build
```

Node 开发模式与 JXA 运行模式采用同一个 `src/core/processor.ts` 和 WASM 引擎：

```bash
npx --no-install tsx src/hosts/node.ts ./tests/chunk_1.pdf
npx --no-install tsx src/hosts/node.ts ./tests
./dist/anydoc-wasm.jxa.js ./tests/chunk_1.pdf
./dist/anydoc-wasm.jxa.js ./tests
```

**注意：**上面四条命令会产生真实输出文件或目录；重复执行会创建编号后缀，而不是覆盖之前的输出。

## 架构

```text
src/
├── core/
│   ├── engine.ts         # 真实 WASM 实例单例及 PDF → Markdown
│   └── processor.ts      # 单 PDF 命名、单目录递归、编号、任务执行
├── ports/file-port.ts    # 宿主无关的文件系统接口
├── adapters/
│   ├── node-fs.ts        # Node FS
│   └── cocoa-fs.ts       # JXA Foundation
├── hosts/
│   ├── node.ts           # Node/tsx 开发入口
│   ├── node-assets.ts    # Node 构建时 WASM / Glue 资产加载
│   └── jxa.ts            # JXA 交付入口
└── shared/               # base64、运行时 polyfills
```

`build.js` 将 WASM 二进制和 wasm-bindgen Glue 打包进 `dist/anydoc-wasm.jxa.js`；PDF 仅在运行时读取。目录转换中 WASM 每进程只初始化一次，按发现的 PDF 顺序逐一转换；不提供多个独立 PDF 路径的串行入口。

## 测试与 GitHub Actions

```bash
npm run test:unit
npm run test:probes
npm run test:directory
npm test
```

`tests/run-directory.ts` 同时覆盖**单 PDF**和**单文件夹递归**，分别通过 Node/tsx 与 JXA 独立执行，并比较生成的 Markdown SHA256 和真实 AnyDoc 基准。测试覆盖文件编号 `.md`、`-1.md`、`-2.md`，以及目录编号 `_md`、`_md 2`、`_md 3`；验证嵌套路径、忽略非 PDF、每次只初始化一次 WASM。

GitHub Actions 在 `macos-latest` 上运行双轨测试。**无论成功或失败**，均生成 `test_report.md`、上传日志 Artifact；push 时自动回写当前分支，忽略报告路径以避免循环触发。测试失败仍会令 Actions job 失败。报告汇总采用纯 JavaScript `tests/summarize-ci.cjs`，不依赖 Python。
