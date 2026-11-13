# JXA — macOS 能力边界实测

- 测试时间 (UTC): 2026-11-13T17:16:42.241Z
- 系统: ProductName:		macOS; ProductVersion:		26.7.2; BuildVersion:		25G332
- Node.js: v24.22.2
- GitHub SHA: dc298545e90b19e78fb900e03be2882c765128ea
- GitHub Run: 43471158698

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

## Mixed PDF Vision OCR recovery (Node / JXA)

| Input mode / file | Node SHA256 | JXA SHA256 | Result |
|---|---|---|---|
| Single PDF / origin.pdf | af8897bd258d5cd2d5f25dea422396737db08c40c0ab5a7f802daaade9a4d67b | af8897bd258d5cd2d5f25dea422396737db08c40c0ab5a7f802daaade9a4d67b | PASS |
| Recursive folder / origin.pdf | af8897bd258d5cd2d5f25dea422396737db08c40c0ab5a7f802daaade9a4d67b | af8897bd258d5cd2d5f25dea422396737db08c40c0ab5a7f802daaade9a4d67b | PASS |
| chunk_1.md | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | PASS |
| chunk_2.md | e74a99d68bd269e2362f01cf83a2df627b41e3c70f854939e7134f9300e89e32 | e74a99d68bd269e2362f01cf83a2df627b41e3c70f854939e7134f9300e89e32 | PASS |
| chunk_3.md | aebc1e760d2a2047dea3e665a3833586d20f2d6652d979749829ea2f01f3c576 | aebc1e760d2a2047dea3e665a3833586d20f2d6652d979749829ea2f01f3c576 | PASS |
| chunk_4.md | ac24b6cf2fe4485fc9fc9c2548c69139ea298ed9ec12c4c3b910356c187ab608 | ac24b6cf2fe4485fc9fc9c2548c69139ea298ed9ec12c4c3b910356c187ab608 | PASS |
| origin.md | af8897bd258d5cd2d5f25dea422396737db08c40c0ab5a7f802daaade9a4d67b | af8897bd258d5cd2d5f25dea422396737db08c40c0ab5a7f802daaade9a4d67b | PASS |

- OCR request metadata is retained in the formatted JSON result as code/pages/pageCount.
- Text-page PDF ranges use AnyDoc; scanned pages use macOS Vision OCR; Markdown is merged in original page order.
- Internal chunk boundary comments are excluded from the exported Markdown.
- Node delegates only native PDFKit/Vision recovery to an isolated JXA helper; Node and JXA each initialize their own AnyDoc WASM singleton once.
- Recursive fixtures are isolated under the OS temporary directory; CI output/log folders are never scanned.
- Source fixture unchanged.

## Document format SHA256 parity (Node / JXA)

| Source format | Node SHA256 | JXA SHA256 | Result |
|---|---|---|---|
| pdf | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | PASS |
| docx | e74a99d68bd269e2362f01cf83a2df627b41e3c70f854939e7134f9300e89e32 | e74a99d68bd269e2362f01cf83a2df627b41e3c70f854939e7134f9300e89e32 | PASS |
| pptx | aebc1e760d2a2047dea3e665a3833586d20f2d6652d979749829ea2f01f3c576 | aebc1e760d2a2047dea3e665a3833586d20f2d6652d979749829ea2f01f3c576 | PASS |
| xlsx | ac24b6cf2fe4485fc9fc9c2548c69139ea298ed9ec12c4c3b910356c187ab608 | ac24b6cf2fe4485fc9fc9c2548c69139ea298ed9ec12c4c3b910356c187ab608 | PASS |
| folder/pdf (also matches single file) | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | PASS |
| folder/docx (also matches single file) | e74a99d68bd269e2362f01cf83a2df627b41e3c70f854939e7134f9300e89e32 | e74a99d68bd269e2362f01cf83a2df627b41e3c70f854939e7134f9300e89e32 | PASS |
| folder/pptx (also matches single file) | aebc1e760d2a2047dea3e665a3833586d20f2d6652d979749829ea2f01f3c576 | aebc1e760d2a2047dea3e665a3833586d20f2d6652d979749829ea2f01f3c576 | PASS |
| folder/xlsx (also matches single file) | ac24b6cf2fe4485fc9fc9c2548c69139ea298ed9ec12c4c3b910356c187ab608 | ac24b6cf2fe4485fc9fc9c2548c69139ea298ed9ec12c4c3b910356c187ab608 | PASS |

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
| Automator single PDF | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | PASS |
| Automator folder/root.md | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | PASS |
| Automator folder/nested/copy.md | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | PASS |
| Automator folder 2/root.md | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | PASS |
| Automator Path object PDF | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | 2a7a622202a145550abe5dc48475c0823d1a32be3cc11058a58df8d8f2cef131 | PASS |

- PASS：目录每次递归创建新镜像根目录：_md、_md 2、_md 3。
- PASS：单个 PDF 依次创建 .md、-1.md、-2.md，不覆盖已有文件。
- PASS：Node 与 JXA 每次实际输出的 Markdown SHA256 相同，符合真实 PDF 基准。
- PASS：每次运行均只初始化一次 WASM；不接受多个独立 PDF 路径。
- 日志：tests/output/directory-*.log

## CI 最终阶段状态

- npm ci: **SUCCESS**
- PDF/Office format SHA256: **SUCCESS**
- Doctor: **SUCCESS**
- TypeScript typecheck: **SUCCESS**
- Unit + JXA probe: **SUCCESS**
- Node/JXA directory SHA256: **SUCCESS**
- OCR metadata unit: **SUCCESS**
- Real PDFKit/Vision OCR file and directory: **SUCCESS**

## 失败阶段日志摘要

- 无，所有必要阶段通过。

