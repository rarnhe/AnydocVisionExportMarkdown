# JXA — macOS 能力边界实测

- 测试时间 (UTC): 2026-11-05T16:59:23.244Z
- 系统: ProductName:		macOS; ProductVersion:		26.6.2; BuildVersion:		25G83
- Node.js: v24.22.1
- GitHub SHA: 24b411114175c3563bcb238b672e791b04e8af65
- GitHub Run: 42070057845

## 测试状态

| 测试 | 结果 | 日志 |
|---|---|---|
| Node.js TypeScript 单元测试 | PASS | tests/output/unit-tests.log |
| JXA 原生能力探针 | PASS | tests/output/jxa.log |

PASS 表示宿主进程运行且结果结构有效，不代表全部 API 均可使用。
unavailable: 宿主未暴露 API；error: API 存在但调用失败；not_tested: 涉及授权/交互而主动跳过。

## JXA 全局接口类型 (typeof)

| Global | JXA |
|---|---|
| $ | function |
| Application | function |
| Atomics | object |
| BigInt | function |
| ObjC | object |
| Promise | function |
| SharedArrayBuffer | undefined |
| WebAssembly | object |
| XMLHttpRequest | undefined |
| console | object |
| fetch | undefined |
| process | undefined |
| require | undefined |
| setTimeout | undefined |

## JXA 能力边界矩阵

| 能力 | 状态 | 详情 |
|---|---|---|
| automation.application_global | supported | API present; not invoked |
| automation.current_application | supported | current application proxy constructed |
| automation.other_app_control | not_tested | Requires GUI and TCC Automation permission; no app controlled |
| host.console | supported | API present; not invoked |
| host.fetch | unavailable | API not exposed |
| host.node_process | unavailable | API not exposed |
| host.node_require | unavailable | API not exposed |
| host.set_timeout | unavailable | API not exposed |
| host.xml_http_request | unavailable | API not exposed |
| js.atomics_api | supported | API present; not invoked |
| js.bigint_api | supported | API present; not invoked |
| js.json | supported | JSON parse OK |
| js.promise_api | supported | API present; not invoked |
| js.shared_array_buffer_api | unavailable | API not exposed |
| js.typed_array | supported | Uint8Array OK |
| objc.appkit_import | supported | AppKit imported; no GUI operation |
| objc.foundation_fs_roundtrip | supported | temporary file write/read success |
| objc.foundation_import | supported | Foundation NSString available |
| objc.global | supported | API present; not invoked |
| objc.gui_control | not_tested | AppKit import does not establish TCC/GUI permission |
| objc.register_subclass_api | supported | API present; not invoked |
| wasm.compile_async_api | supported | API present; not invoked |
| wasm.compile_streaming_api | unavailable | API not exposed |
| wasm.empty_module_instance | supported | 8-byte empty WASM module instantiated |
| wasm.exported_add_function | supported | WASM export add(20,22) = 42 |
| wasm.instantiate_async_api | supported | API present; not invoked |
| wasm.instantiate_streaming_api | unavailable | API not exposed |
| wasm.memory | supported | one 64KiB page |
| wasm.validate | supported | valid empty WASM module |

## 测量限制

- WASM 功能探针使用最小模块，真实 AnyDoc WASM 转换由独立测试验证。
- WASM compile/instantiate 的异步及 streaming API 只检查存在性，不等待 Promise。
- Foundation FS 探针尝试在临时目录写入、读取、删除文件。
- Application.currentApplication() 仅证明当前应用代理可构造，不证明跨应用控制权。
- CI 不主动访问 Finder 或 System Events：其他应用的 Apple Events/TCC 授权未测试。
- AppKit 桥接不等于拥有可用图形会话；测试结果随 macOS 版本变化。

## 失败项

- 无

完整 stdout/stderr 见 GitHub Actions 上传的 tests/output/ 日志。


## 真实 AnyDoc WebAssembly 转换（Node 对照 + JXA 原生执行）

- 安装版本：@firecrawl/anydoc-wasm@0.2.4 + esbuild@0.28.2。
- 输入文件：tests/chunk_1.pdf；size=530915 bytes; SHA256=d4e7ce42c916d50b0be298f7d4a2520bb88cc3f8f1480aa14af78e9f0af2063d
- 模式：JXA 在自己的进程直接构造真实 WASM Module、initSync 并调用 toMarkdownBytes；不依赖其他 JavaScript 运行时进程。
- Node 仅负责构建脚本和独立正向对照。
- 总结论：**PASS**

| 测试 | 结果 | 阶段 | WASM 字节 | validate | wasm-bindgen 初始化 | Markdown 字节 | SHA256 | 说明 |
|---|---|---|---:|---|---|---:|---|---|
| AnyDoc glue build | PASS | build | - | - | - | - | - | Build OK |
| node-control | PASS | done | 6691779 | true | WasmGlue.initSync(module) | 43139 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | Real PDF converted successfully |
| jxa-direct | PASS | done | 6691779 | true | WasmGlue.initSync(module) | 43139 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | Real PDF converted successfully |

- Node 与 JXA 的真实 Markdown SHA256 完全一致：**PASS**
- 真实转换必须完成 WASM validate、Module、initSync、toMarkdownBytes 和输出校验。
- 日志：tests/output/build-anydoc.log、node-control.log、jxa-direct.log。
- Markdown 保存在 Actions Artifact 的 tests/output/node-control.md 与 jxa-direct.md。
- 本次是单次真实 PDF 转换；多文件单例复用由独立 singleton 测试覆盖。

## JXA 单进程 + ObjC 文件系统 + WASM 单例：真实 PDF 转 Markdown

- Node/tsx 与 JXA 共用 TypeScript WASM 引擎；JXA 运行时仅 Foundation + WASM，不启动外部解释器或子进程。
- 每个进程处理原始 PDF 与同字节副本，断言 WASM 初始化 1 次、转换 2 次。
- Node TSX、JXA osascript、JXA 可执行文件生成的 Markdown MD5 必须一致。
- 历史真实 AnyDoc SHA256 基准：2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131
- 结论：**PASS**

| 步骤 | 结果 | WASM init | PDF count | bytes | MD5 | SHA256 | 详情 |
|---|---|---:|---:|---:|---|---|---|
| build | PASS | - | - | - | - | - | Bundle generated, size=8945435 |
| node-tsx | PASS | 1 | 2 | 43139 | a81c4262b857e793c8093d8a302ba697 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | 2 PDFs converted in one process; one WASM initialization |
| jxa-osascript | PASS | 1 | 2 | 43139 | a81c4262b857e793c8093d8a302ba697 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | 2 PDFs converted in one process; one WASM initialization |
| jxa-executable | PASS | 1 | 2 | 43139 | a81c4262b857e793c8093d8a302ba697 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | 2 PDFs converted in one process; one WASM initialization |

- 三种运行时 MD5 完全一致：**PASS**
- 历史 SHA256 基准一致：**PASS**
- Markdown 与日志保存在 tests/output/ 并上传为 Actions Artifact。

## CI 最终阶段状态
- Dependencies: success
- Checkout / Node 24 doctor: success
- TypeScript typecheck: success
- TypeScript unit tests + JXA native probe: success
- Real AnyDoc Node/JXA baseline: success
- JXA single-process singleton MD5 comparison: success
