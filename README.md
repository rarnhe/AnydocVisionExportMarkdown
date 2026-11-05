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
npm install
npm run doctor
npm run typecheck
```

## 使用方式

### 开发模式（Node + TypeScript）

```bash
npx --no-install tsx src/node/cli.ts ./tests/chunk_1.pdf
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
