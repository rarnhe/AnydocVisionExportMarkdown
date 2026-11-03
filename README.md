# AnydocVisionExportMarkdown

基于 macOS 原生 **JXA + JavaScriptCore + WebAssembly** 的 PDF 批量转 Markdown MVP。

## 架构

- `build.js`：读取 AnyDoc WASM 与 JS glue，将二者编译/注入到单个 `dist/anydoc-wasm.jxa.js`。
- `src/node/cli.ts`：开发态入口，要求显式传入 PDF 目录；构建 bundle 后调用 macOS 的 osascript。
- `src/jxa/jxa-main.ts`：区分 Node 与 JXA 宿主。
- `src/jxa/task-router.ts`：枚举目录 PDF（排除 `test.pdf`），读取内嵌 WASM 与 glue，收集 PDF 数据并启动一个 JSC 进程。
- `src/jsc/jsc-runner.ts`：在单个 JSC 进程内初始化 WASM 一次，再循环转换该批次的 PDF。
- `src/jsc/polyfills.ts`：提供 WASM glue 所需的 JSC 兼容 API。

**资源策略：WASM 内嵌在生成的 JS 文件中；PDF 不参与构建、不进入 JS，只在运行时从用户指定目录读取。** 因此发布时只需分发 `dist/anydoc-wasm.jxa.js`，不需要旁置 `.wasm` 文件。批次内只启动一个 JSC 进程并初始化一次 WASM。

## 安装

需要 macOS（提供 `osascript`、JavaScriptCore 与 Foundation）、Node.js 和 npm：

```bash
npm ci
```

## 三种运行方式

三种入口都要求显式指定目录，不再默认使用任何 PDF：

```bash
# 方式一：TypeScript 开发态（内部构建后调用 JXA）
npx tsx src/node/cli.ts ./tests

# 方式二：先构建，再直接执行 JXA bundle
node build.js
./dist/anydoc-wasm.jxa.js ./tests

# 方式三：显式使用 osascript 宿主
osascript -l JavaScript ./dist/anydoc-wasm.jxa.js ./tests
```

程序扫描目录第一层的 PDF 文件，跳过大小写不敏感的 `test.pdf`，并为每个输入文件生成同目录同名 `.md` 文件。

## 批量测试

```bash
bash tests/test_batch.sh
```

测试从 `tests/chunk_1.pdf` 创建五份临时副本，与原件合计六份；分别通过三种方式转换，检查六份 Markdown 是否生成、非空，并比较三种模式的输出一致性。测试结束会删除五份临时 PDF 副本，但保留原始 `chunk_1.pdf` 和另有用途的 `test.pdf`。报告写入根目录 `test_report.md`，诊断日志与输出副本位于 `tests/output/`。

GitHub Actions 使用 `macos-latest`。失败时仍上传报告和日志 Artifact。GitHub 官方托管 runner 不提供 macOS Mojave 10.14；较新系统 CI 通过不代表 Mojave 兼容性已得到验证。

## 当前边界

- 当前只处理指定目录的第一层 PDF，不递归子目录。
- 每次批量执行初始化一次 WASM；不同进程之间不共享实例。
- PDF 内容目前会在 JXA 与 JSC 进程间通过 Base64 脚本参数传递，超大 PDF/超大批次仍可能产生较高内存占用。
- WASM 与 glue 的导出 API、JSC WebAssembly 支持和 macOS 版本兼容性仍需真实设备测试。
- 性能提升应以实际批量基准测试衡量，不预设加速倍数。

仓库原有 `dist/node_jxa_jsc_wasm.jxa.js` 本次不修改。
