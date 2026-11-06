# AnyDocVisionExportMarkdown

基于 **TypeScript → JXA + Objective-C Foundation + WebAssembly** 的 macOS PDF → Markdown 工具。项目的正式输入是**单个文件夹**，递归扫描其中的 PDF 并创建镜像 Markdown 文件夹，不支持直接传入单个 PDF 或 PDF 路径列表。

## 核心设计

构建时由 Node.js、TypeScript 和 esbuild 将 `@firecrawl/anydoc-wasm` 的 WASM 二进制及 wasm-bindgen Glue 嵌入独立 JXA JavaScript。交付后程序在 macOS 的 JXA 宿主中通过 Foundation 读写文件、直接使用 WebAssembly，不再依赖 Node、npm、JSC 或外部子进程。

每个处理进程只初始化一个 WASM 实例，依次转换目录内需要处理的 PDF。**发现目标 Markdown 已存在时跳过，不覆盖**；如果全部存在，连 WASM 都不初始化。

## 环境与安装

- macOS（JXA / `osascript` + Objective-C Foundation）
- Node.js 24+（仅开发、构建、测试）
- npm 与提交的 `package-lock.json`

```bash
npm ci
npm run doctor
npm run typecheck
```

## 使用方式

### 开发模式：Node/tsx

```bash
npx --no-install tsx src/hosts/node.ts ./tests
```

### 打包及交付模式：JXA

```bash
npm run build
./dist/anydoc-wasm.jxa.js ./tests
```

运行时递归扫描 `./tests`，在输入目录的**同级**生成 `./tests_md`：

```text
tests/
├── chunk_1.pdf
└── reports/
    └── 2026/
        └── final.PDF

tests_md/
├── chunk_1.md
└── reports/
    └── 2026/
        └── final.md
```

上面的 reports 示例用于解释镜像关系，仓库当前不保证包含该示例子目录。

指定单独的输出根目录（仍保留输入目录的相对层级）：

```bash
./dist/anydoc-wasm.jxa.js --output-dir ./my-markdown ./tests
```

**处理规则**

- CLI 只接受一个目录；单个 PDF、多个 PDF 路径、多个目录输入均会报错。
- 递归识别大小写不敏感的 `.pdf` 文件；忽略普通非 PDF 文件与符号链接。
- 输出目录为 `A_md`（或 `--output-dir` 指定目录），保留相对路径，文件扩展名统一为 `.md`。
- 已存在的 Markdown **跳过**：不重新计算、不替换内容。新文件继续转换；全部存在时不初始化 WASM。
- 预先发现目标文件名冲突则报错。运行结果包含扫描数量、转换数量、跳过数量、失败数量和 WASM 初始化次数。
- 一个 PDF 转换失败会记录错误并继续处理其他 PDF；Node 入口在存在失败时返回非零退出码。
- JXA 生成的文件和 Node 生成的文件遵循相同的核心逻辑，正式交付仅使用 JXA。

## TypeScript 分层

```text
src/
├── core/
│   ├── engine.ts           # WASM 单例引擎及 PDF→Markdown
│   └── processor.ts        # 目录扫描、路径镜像、跳过规则和串行转换
├── ports/
│   └── file-port.ts        # 文件系统契约
├── adapters/
│   ├── node-fs.ts          # Node 文件系统实现
│   └── cocoa-fs.ts         # Foundation 文件系统实现
├── hosts/
│   ├── node.ts             # 开发入口
│   ├── node-assets.ts      # 开发与构建阶段共用 WASM/Glue 定位
│   └── jxa.ts              # JXA 交付入口
└── shared/
    ├── base64.ts
    └── polyfills.ts
```

`processor.ts` 不依赖 Node API 或 ObjC，目录递归算法在开发和交付环境中共用。根目录 `build.js` 直接复用 `src/hosts/node-assets.ts` 加载 WASM 和 Glue 资产，不再需要额外 tools/scripts 目录。

## 自动化测试

测试全部采用 TypeScript/JavaScript，不引入 Python。

```bash
npm run test:unit       # 输入参数、目录规划、输出跳过及安全规则
npm run test:probes     # Node 单元测试 + JXA Foundation/WASM 能力边界探针
npm run test:directory  # 真实目录递归：Node 与 JXA 输出 SHA256 对照
npm test                # 依次执行 typecheck、probes、directory
```

`tests/run-directory.ts` 以 `tests/chunk_1.pdf` 构建两层目录测试夹具，分别通过 Node/tsx 和 **JXA 可执行入口**生成两个相互独立的 Markdown 目录树。测试逐文件比较两种模式产出的 SHA256，同时验证历史 AnyDoc 转换基准、目录结构、WASM 单例及第二次运行跳过文件且不更改内容的行为。

CI 的工作目录位于 `tests/output/`，原始输入 PDF fixture 不被修改。

## GitHub Actions 与双轨报告

`.github/workflows/test_macos.yml` 在 **macos-latest + Node.js 24** 上完成依赖安装、诊断、类型检查、Node/JXA 能力测试、真实目录转换测试。

- 每个测试阶段即使失败也继续进入报告汇总。
- `test_report.md` 永远包含该次 CI 的阶段状态以及错误摘要；具体日志保留在 Actions Artifacts。
- 在分支 **push** 工作流中自动提交 `test_report.md` 回本分支，便于 GitHub 页面直接查看；PR 工作流不直接回写，避免权限问题和重复提交。
- 工作流的 push 触发明确忽略 `test_report.md`，防止机器人提交报告引发循环。
- 最终断言失败时整个 job 仍然失败，报告保存不代表测试成功。

## 实现范围说明

本项目仅针对 macOS JXA + Foundation 交付。Node/tsx 是构建与正确性对照环境，而非额外的正式发布程序。没有 JSC 子进程、独立 wasm 文件或额外 npm 框架。
