# AnyDocVisionExportMarkdown

基于 **JXA + Objective-C Foundation + WebAssembly** 的 macOS PDF → Markdown 转换工具。

本项目采用单进程架构：Node.js/TypeScript 仅用于开发、构建和测试；最终产物是独立可执行的 JXA JavaScript 文件。运行时由 JXA 通过 Foundation 读取/写入文件，并在同一进程中初始化、复用唯一的 AnyDoc WASM 实例。

## 核心架构

- **Node.js / TypeScript**：开发模式入口、依赖资产解析、静态检查和测试。
- **build.js / esbuild**：将 AnyDoc wasm-bindgen glue、WASM 二进制和 TypeScript JXA 入口打包为 `dist/anydoc-wasm.jxa.js`。
- **JXA**：负责命令行参数、目录创建、PDF 扫描/读取和 Markdown 写出。
- **Objective-C Foundation**：通过 `NSData`、`NSString`、`NSFileManager` 完成文件系统操作。
- **WASM singleton**：每个进程只初始化一次 WebAssembly Module/Instance，批量转换时复用同一个引擎。

JXA 运行时不启动 JSC、NSTask、Node 子进程或其他解释器。

## 环境与安装

- macOS（需要 `osascript` 和 JXA Objective-C bridge）
- Node.js 24+
- npm

```bash
npm ci
npm run doctor
npm run typecheck
```

## 使用方式

### 开发模式（Node + TypeScript）

```bash
npx --no-install tsx src/hosts/node.ts ./tests/chunk_1.pdf
```

### 构建独立 JXA 程序

```bash
npm run build
```

构建产物：`dist/anydoc-wasm.jxa.js`。

### 执行独立 JXA 程序

```bash
./dist/anydoc-wasm.jxa.js ./tests/chunk_1.pdf
```

也可以通过 osascript：

```bash
osascript -l JavaScript ./dist/anydoc-wasm.jxa.js ./tests/chunk_1.pdf
```

默认在输入 PDF 同目录写出同名 Markdown。支持一次传入多个 PDF；如需指定输出目录：

```bash
./dist/anydoc-wasm.jxa.js --output-dir ./output ./a.pdf ./b.pdf
```

## 测试体系（TypeScript + JavaScript）

测试目录不使用 Python。测试覆盖：

- `tests/unit.test.ts`：Node 原生测试运行器，验证 JSON 协议、报告转义、Markdown 校验、目录结构及 PDF fixture。
- `tests/probe.js` + `tests/run-probes.ts`：只测试 **JXA** 的 macOS 宿主能力边界，包括 WebAssembly、Foundation、ObjC bridge、Application API 和文件系统读写；不再运行 JSC 能力测试。
- `tests/run-anydoc.ts`：使用真实 AnyDoc WASM 对 PDF 执行一次 Node 对照和一次 JXA 原生转换，验证 Markdown SHA256 一致。
- `tests/run-single-process.ts`：验证 Node/TSX、JXA osascript、独立 JXA 可执行文件三种入口；每个进程连续转换两份 PDF，WASM 初始化恰好一次，Markdown MD5/SHA256 一致。
- `tests/build-anydoc.cjs`、`tests/anydoc-runtime.js`：构建独立真实 WASM 转换 smoke test。

运行全部测试：

```bash
npm test
```

也可分别运行：

```bash
npm run test:unit
npm run test:probes
npm run test:anydoc
npm run test:singleton
```

## CI 与报告

GitHub Actions 在 macOS + Node.js 24 上运行 TypeScript 静态检查、JXA 能力边界探针、真实 WASM 转换及多 PDF 单例回归。无论测试成功或失败，都会生成/保留 `test_report.md`，并上传日志和 Markdown 结果 Artifact。

`test_report.md` 由 TypeScript 测试程序生成；CI 仅回写报告文件，并忽略报告文件的 push 触发，避免工作流循环。


## TypeScript → JXA 模板分层

```text
src/
├── core/         engine.ts（WASM 单例）+ batch.ts（转换编排）
├── ports/        file-port.ts（文件系统抽象契约）
├── adapters/     node-fs.ts + cocoa-fs.ts（宿主实现）
├── hosts/        node.ts（TSX 开发入口）+ node-assets.ts（统一 WASM 资产加载）+ jxa.ts（JXA 发布入口）
└── shared/       base64.ts + polyfills.ts
```

开发阶段：`npx --no-install tsx src/hosts/node.ts ./tests/chunk_1.pdf`；构建阶段：`node build.js`；交付产物：`dist/anydoc-wasm.jxa.js`，在 macOS 使用 `osascript -l JavaScript` 或直接执行。JXA 运行时不依赖 Node/npm，也不启动 JSC 子进程。Node 与 JXA 共享 core 和 ports，仅 adapters/hosts 依宿主切换。

依赖版本由 `package.json` 精确指定、`package-lock.json` 固定依赖树；首次安装与 CI 均使用 `npm ci`。所有源码变更均由 macOS GitHub Actions 执行 TS 类型检查、JXA 宿主能力探针、真实 WASM 转换和双 PDF 单例测试，测试报告写入 `test_report.md`。


### 单一 WASM 资产加载入口

`src/hosts/node-assets.ts` 是 Node 开发与构建共用的唯一 WASM/Glue 加载实现：解析 npm 包、读取并校验 WASM、选择 Glue、转换为 IIFE。根目录 `build.js` 通过 `tsx/cjs` 直接加载该 TypeScript 模块，Node 开发入口也直接调用它，避免依赖升级时双处维护。该 TypeScript 模块**仅在 Node 环境使用**，不参与 JXA 运行时打包；JXA 继续从编译后的 JS 内嵌常量获取 WASM/Glue。


项目不再使用额外的 `tools/`、`scripts/` 目录。Node 专用 WASM 资产加载位于 `src/hosts/node-assets.ts`，诊断脚本位于 `tests/doctor.cjs`；根目录仅保留构建入口及 npm 配置。
