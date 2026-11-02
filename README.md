# AnydocVisionExportMarkdown

使用 macOS 原生 **JXA（JavaScript for Automation）+ JavaScriptCore + WebAssembly** 将 PDF 转换为 Markdown 的实验性 MVP。

## 架构

- `src/node/cli.ts`：开发调试入口，使用 Node.js / esbuild 准备 WASM 与 JXA 脚本。
- `src/jxa/jxa-main.ts`：JXA 入口与宿主识别。
- `src/jxa/task-router.ts`：PDF 读取、任务派发、输出写入。
- `src/jxa/cocoa-fs.ts`：Foundation 文件系统封装。
- `src/jxa/app-control.ts`：Finder 交互。
- `src/jsc/jsc-runner.ts`：生成独立 JSC WASM 运行脚本。
- `src/jsc/polyfills.ts`：为 JSC 补充必要的 JavaScript API。
- `src/types/`：JXA 与 WASM 类型定义。
- `build.js`：将 WASM 与胶水代码静态打包成可执行 JXA 文件。

核心数据流：PDF → JXA/Foundation 读取 → Base64 → NSTask 启动系统 JSC → AnyDoc WASM 转换 → stdout → Markdown 文件。Node.js 只参与构建和开发调试，不是预期发布脚本的运行时依赖。

## 环境与安装

需要 macOS、Node.js、npm、系统自带 `osascript` 与 JavaScriptCore。安装依赖：

```bash
npm ci
```

首次创建同类项目可用 `npm init -y` 与 `npm install --save-dev esbuild @firecrawl/anydoc-wasm tsx`，但本仓库已有 package.json 和锁文件，无须重新初始化。

## 三种运行方式

输入样本实际位于 **`tests/chunk_1.pdf`**（注意是 tests，不是 test）。执行：

```bash
npx tsx src/node/cli.ts ./tests/chunk_1.pdf
node build.js
./dist/anydoc-wasm.jxa.js ./tests/chunk_1.pdf
osascript -l JavaScript ./dist/anydoc-wasm.jxa.js ./tests/chunk_1.pdf
```

预期输出：`tests/chunk_1.md`。每种运行方式都会覆盖同名输出，测试脚本会分别保留副本并检查内容。

## 自动化与本地验证

```bash
npx tsx tests/validate.ts
```

测试检查：PDF 签名、编译产物、三种运行方式的退出状态、Markdown 文件存在性、非空且非占位内容、UTF-8 基本有效性、三种输出内容一致性。生成根目录 `test_report.md`，并在 `tests/output/` 保留每种方式的输出副本。

GitHub Actions 使用当前可用的 macOS runner，测试报告以 Artifact 和 Job Summary 双轨保存。**GitHub 官方托管 runner 不提供 macOS Mojave 10.14**；如果需要严格验证 Mojave，请在 Mojave 本机或自托管 runner 上执行上述命令。较新 macOS CI 通过不代表 Mojave 已验证。

## 限制

当前仅实现 PDF → Markdown。转换核心来自 `@firecrawl/anydoc-wasm`。JSC 的 WebAssembly 能力、胶水层导出接口以及 macOS 版本兼容性需要真实运行验证。输出文本使用标记协议，未来建议改为结构化协议并强化错误处理。

仓库原有 `dist/node_jxa_jsc_wasm.jxa.js` 为既有本地构建产物，本次变更不修改它。
