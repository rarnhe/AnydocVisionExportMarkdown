# AnyDocVisionExportMarkdown

macOS 下基于 TypeScript、JXA、Objective-C Foundation 与 `@firecrawl/anydoc-wasm` 的多格式文档 → Markdown 工具。正式运行交付物是**独立 JXA JavaScript**，无需 Node、npm、JSC 子进程或外置 WASM 文件。

## 两种输入模式

仅接收**一个输入路径**：一个 PDF 文件，或一个需要递归处理的文件夹。**不支持多个 PDF 路径串行输入，也不支持 `--output-dir`。**

### 单个文档

```bash
./dist/anydoc-wasm.osascript.js /path/to/report.pdf
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
./dist/anydoc-wasm.osascript.js /path/to/Reports
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

递归识别下方列出的所有 AnyDoc 支持格式（扩展名大小写不敏感）；忽略其他文件及符号链接。**每次处理一个文件夹，不接受多个文件夹或文件路径列表。** 不覆盖已有输出文件。

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
./dist/anydoc-wasm.osascript.js ./tests/chunk_1.pdf
./dist/anydoc-wasm.osascript.js ./tests
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
│   ├── node.ts           # Node/tsx 入口；复杂 PDF 通过 JXA 调用原生 Vision
│   ├── node-assets.ts    # Node 构建时 WASM / Glue 资产加载
│   └── jxa.ts            # JXA 交付入口
└── shared/               # base64、运行时 polyfills
```

`build.js` 将 WASM 二进制和 wasm-bindgen Glue 打包进 `dist/anydoc-wasm.osascript.js`；PDF 仅在运行时读取。目录转换中 WASM 每进程只初始化一次，按发现的 PDF 顺序逐一转换；不提供多个独立 PDF 路径的串行入口。

## 测试与 GitHub Actions

```bash
npm run test:unit
npm run test:probes
npm run test:directory
npm test
```

`tests/run-directory.ts` 同时覆盖**单 PDF**和**单文件夹递归**，分别通过 Node/tsx 与 JXA 独立执行，并比较生成的 Markdown SHA256 和真实 AnyDoc 基准。测试覆盖文件编号 `.md`、`-1.md`、`-2.md`，以及目录编号 `_md`、`_md 2`、`_md 3`；验证嵌套路径、忽略非 PDF、每次只初始化一次 WASM。

GitHub Actions 在 `macos-latest` 上运行双轨测试。**无论成功或失败**，均生成 `test_report.md`、上传日志 Artifact；push 时自动回写当前分支，忽略报告路径以避免循环触发。测试失败仍会令 Actions job 失败。报告汇总采用纯 JavaScript `tests/summarize-ci.cjs`，不依赖 Python。

## Automator：Finder 快速操作（无需外部子进程）

`npm run build` 现在生成两个独立、内嵌同一 WASM 的 JXA 文件：

- `dist/anydoc-wasm.osascript.js`：保留命令行 `run(argv)`，支持 `./dist/anydoc-wasm.osascript.js ./reports`。
- `dist/anydoc-wasm.automator.js`：适配 Automator「运行 JavaScript」的 `run(input, parameters)`，用于直接粘贴。

在 Automator 新建「快速操作」，工作流程接收 Finder 中的**文件或文件夹**，添加「运行 JavaScript」，将 `anydoc-wasm.automator.js` 的**完整内容**替换默认脚本（不要粘贴进已有的 `run` 函数内），保存。Finder 右键选择快速操作时，**只选择一个 PDF 或一个文件夹**。成功后脚本返回原始 `input`，供后续操作继续使用；有转换失败则抛出错误。

Automator 版本不需要命令行 shebang，也不启动 `osascript` 子进程。文件较大是因为内嵌 WASM；建议在 Automator 编辑器中粘贴前确认内存和响应情况。构建和 CI 使用 Node；部署后的两个脚本均不依赖 Node。实际 Finder 对象桥接仍需在 Automator UI 中验收。

## TypeScript 模块配置

`tsconfig.json` 使用 `"module": "Preserve"` 和 `"moduleResolution": "Bundler"`，消除 TypeScript 6 的 `node10` 弃用提示；不使用 `ignoreDeprecations` 掩盖问题。类型检查与真实 macOS JXA 测试在 GitHub Actions 中验证。

### Automator 模板与 macOS CI

`dist/anydoc-wasm.automator.js` 先在**顶层**定义完整的 AnyDoc/WASM 引擎，最后才定义轻量的 `function run(input, parameters)` 适配入口，成功时 `return input;`。Automator 的「运行 JavaScript」操作需要**全选替换**默认示例，粘贴整个生成文件；不要将其放进默认 `run` 函数内部。

`tests/run-directory.ts` 在 macOS CI 中通过 `osascript -l JavaScript` 直接执行 Automator 版本，检查单 PDF、递归文件夹、第二次运行编号、SHA256 与 CLI 一致，以及缺失输入时拒绝执行；同时检查打包后的 WASM 引擎定义位于 `run(input, parameters)` 之前。**这验证 JXA 代码和转换结果，不等于在真实 Finder/Automator 图形会话中验证了 Apple Events 授权与对象桥接**，后者仍需在本机 Finder 中验收。

### Automator 对象输入的独立 CI 验证

macOS CI 除了直接以 `osascript` 执行 Automator 脚本外，还通过临时测试包装器向**同一个打包后的 `run(input, parameters)` 函数**传入 `Path(...)` 对象，模拟 Finder 风格的 JXA 文件对象。验证真实 PDF 转换成功，Markdown SHA256 与 Node/JXA CLI 基准一致。该测试不启动 Automator 图形界面，也不替代 Finder/TCC 授权验收。

## 多格式输入与 PDF OCR 恢复

- 单文件及目录递归输入支持 AnyDoc 的全部格式：Word（`.doc`、`.docx`、`.docm`）；PowerPoint（`.ppt`、`.pps`、`.pot`、`.pptx`、`.pptm`、`.ppsx`、`.ppsm`）；Excel（`.xls`、`.xlsx`、`.xlsm`、`.xlsb`）；OpenDocument（`.odt`、`.ods`、`.odp`）；RTF（`.rtf`）；EPUB（`.epub`）；CSV（`.csv`）；PDF（`.pdf`）。扩展名大小写不敏感。
- PDF 首先使用一次 AnyDoc WASM；仅在返回 `needsOcr` 时，根据错误中的 `code`、`pages`、`pageCount`（也兼容 `pages 12, 17, 20-56 of 56 need OCR` 文本形式）进入恢复流程。\n- JXA 使用原生 PDFKit 将连续文本页切成 PDF、将扫描页渲染为图像，再分别调用 AnyDoc 和 macOS Vision OCR，最后按原始页码合并 Markdown 并清理临时文件。\n- Node 开发模式遇到混合 PDF 时，将 PDFKit/Vision 原生工作委托给独立 `osascript` JXA 进程；Node 自身的 AnyDoc WASM 单例仍只初始化一次。Node 和 JXA 均需在 macOS 上运行；Node 回退前需先 `npm run build`。
- 所有支持格式统一输出原始文件名去掉扩展名后的 `name.md`。如果同一文件夹存在不同格式但同名的文件，目录模式会明确报出输出名称冲突，不会静默覆盖。文件夹输出 `folder_md`、`folder_md 2` 等镜像目录。
- `tests/chunk_1.pdf` 为纯文本基准；`tests/origin.pdf` 为 56 页混合 OCR 基准；`tests/chunk_2.docx`、`tests/chunk_3.pptx`、`tests/chunk_4.xlsx` 为已提交到仓库的 Office 格式基准；CI 不再动态生成或回写 Office 测试文件。
- CI 继续使用现有 PDF、DOCX、PPTX、XLSX 基准验证单文件及文件夹 Node/JXA SHA256 一致性（本次不新增格式测试文件或测试代码），并验证混合 PDF 在 Node/JXA 的单文件、混合文件夹及直接递归 `tests/` 输入下 SHA256 一致；同时断言 `ANYDOC_BATCH_JSON` 保留 OCR 的 `code/pages/pageCount`。结果写入 `test_report.md`。
