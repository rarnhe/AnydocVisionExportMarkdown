# AnydocVisionExportMarkdown

基于 macOS 原生 **JXA + JavaScriptCore + WebAssembly** 的 PDF 批量转 Markdown MVP。

## 架构

- `build.js`：读取 AnyDoc WASM 与 JS glue，将二者编译/注入到单个 `dist/anydoc-wasm.jxa.js`。
- `src/node/cli.ts`：开发态入口，要求显式传入 PDF 目录；构建 bundle 后调用 macOS 的 osascript。
- `src/jxa/jxa-main.ts`：区分 Node 与 JXA 宿主。
- `src/jxa/task-router.ts`：枚举目录中的全部 PDF，不按文件名设置排除规则；启动一个 JSC 进程，并逐份读取、传输 PDF 字节。
- `src/jsc/jsc-runner.ts`：在单个 JSC 进程内初始化 WASM 一次，通过 stdin 逐份接收 PDF 字节并循环转换。
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

程序扫描目录第一层的全部 PDF 文件，不根据文件名进行特殊判断；包括 `test.pdf` 在内的每个 PDF 都会生成同目录同名 `.md` 文件。

## 批量测试

```bash
bash tests/test_batch.sh
```

测试从 `tests/chunk_1.pdf` 创建五份临时副本，然后扫描 `tests/` 中的全部 PDF（包括 `test.pdf` 和其他用户放入的 PDF），分别通过三种方式转换，检查每份 Markdown 是否生成、非空，并比较三种模式的输出一致性。测试结束只删除本次创建的五份临时 PDF 副本，保留目录中原有的所有 PDF。报告写入根目录 `test_report.md`，诊断日志与输出副本位于 `tests/output/`。

GitHub Actions 使用 `macos-latest`。失败时仍上传报告和日志 Artifact。GitHub 官方托管 runner 不提供 macOS Mojave 10.14；较新系统 CI 通过不代表 Mojave 兼容性已得到验证。

## 当前边界

- 当前只处理指定目录的第一层 PDF，不递归子目录。
- 每次批量执行初始化一次 WASM；不同进程之间不共享实例。PDF 不会被一次性编码进批量脚本，而是逐份读取并通过 stdin 传给 JSC，处理完一份再读取下一份，降低批量任务的峰值内存。
- WASM API 只接受字节，不具备文件系统访问能力。当前 JXA 与独立 JSC 进程之间使用逐份 Base64 行传输二进制字节（不是把 PDF 写入最终 JS，也不是一次性缓存整批 PDF）；单个超大 PDF 仍会产生该文件自身的字节与 Base64 临时内存开销。
- WASM 与 glue 的导出 API、JSC WebAssembly 支持和 macOS 版本兼容性仍需真实设备测试。
- 性能提升应以实际批量基准测试衡量，不预设加速倍数。

仓库原有 `dist/node_jxa_jsc_wasm.jxa.js` 本次不修改。
