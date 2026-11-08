# JXA — macOS 能力边界实测

- 测试时间 (UTC): 2026-11-08T00:11:53.348Z
- 系统: ProductName:		macOS; ProductVersion:		26.7.2; BuildVersion:		25G332
- Node.js: v24.22.2
- GitHub SHA: 5bc2c948204721ddce156d1f031ddaf4cc9d2401
- GitHub Run: 42428632533

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

## 单个 PDF 与递归目录：Node / JXA SHA256 对照

| 测试 | Node SHA256 | JXA SHA256 | 结果 |
|---|---|---|---|
| folder/chunk_1.md | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | PASS |
| folder/nested/deep/copy.md | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | PASS |
| folder 2/chunk_1.md | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | PASS |
| folder 2/nested/deep/copy.md | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | PASS |
| folder 3/chunk_1.md | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | PASS |
| folder 3/nested/deep/copy.md | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | PASS |
| single PDF 1 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | PASS |
| single PDF 2 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | PASS |
| single PDF 3 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | PASS |

- PASS：目录每次递归创建新镜像根目录：_md、_md 2、_md 3。
- PASS：单个 PDF 依次创建 .md、-1.md、-2.md，不覆盖已有文件。
- PASS：Node 与 JXA 每次实际输出的 Markdown SHA256 相同，符合真实 PDF 基准。
- PASS：每次运行均只初始化一次 WASM；不接受多个独立 PDF 路径。
- 日志：tests/output/directory-*.log

## CI 最终阶段状态

- npm ci: **SUCCESS**
- Doctor: **SUCCESS**
- TypeScript typecheck: **SUCCESS**
- Unit + JXA probe: **SUCCESS**
- Node/JXA directory SHA256: **SUCCESS**

## 失败阶段日志摘要

- 无，所有必要阶段通过。

