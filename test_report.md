# JXA — macOS 能力边界实测

- 测试时间 (UTC): 2026-11-13T16:04:35.413Z
- 系统: ProductName:		macOS; ProductVersion:		26.7.2; BuildVersion:		25G332
- Node.js: v24.22.2
- GitHub SHA: 9cdee9ba4f444e8255433db42ab0fc90e943aab3
- GitHub Run: 43458961238

## 测试状态

| 测试 | 结果 | 日志 |
|---|---|---|
| Node.js TypeScript 单元测试 | FAIL | tests/output/unit-tests.log |
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

- Node.js TypeScript unit tests failed; see unit-tests.log

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
- Unit + JXA probe: **FAILURE**
- Node/JXA directory SHA256: **SUCCESS**
- OCR metadata unit: **SUCCESS**
- Real PDFKit/Vision OCR file and directory: **SUCCESS**

## 失败阶段日志摘要

### Unit + JXA probe

```text
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

- Node.js TypeScript unit tests failed; see unit-tests.log

完整 stdout/stderr 见 GitHub Actions 上传的 tests/output/ 日志。


```

#### Node unit test details

```text
✔ probe parser extracts JSON after diagnostic output (1.556083ms)
✔ probe parser skips malformed marker and accepts a later valid marker (0.3595ms)
✔ probe parser rejects missing marker and wrong schema (0.333208ms)
✔ Markdown report escaping handles pipes and newlines (0.169583ms)
✔ batch parser accepts JXA and Node results (0.248959ms)
✖ batch parser rejects missing marker and invalid schema (1.053291ms)
✔ log sanitizer flattens lines and separators (0.1275ms)
✔ Markdown validator accepts UTF-8 and rejects short or placeholder content (0.293167ms)
✔ TS to JXA ports/adapters template files exist (0.204041ms)
✔ application src tree contains TypeScript files only (0.608791ms)
✔ tests tree contains no Python source (0.213375ms)
✔ real PDF fixture exists and has a valid header (0.23525ms)
✔ package build and doctor scripts are declared (0.134542ms)
✔ CI uses reproducible npm ci with committed lockfile (0.257333ms)
✔ production JXA entry and Node host share core but not host APIs (0.194625ms)
✔ build and TSX development use one TypeScript asset loader (0.169625ms)
✔ single PDF output numbering starts at -1 and never overwrites (25.749916ms)
✔ recursive folder creates a fresh _md tree on each run, suffix starts at space 2 (11.609292ms)
✔ report aggregation is JavaScript-only and always runs (0.194833ms)
✔ TypeScript uses modern bundler resolution without suppressing deprecations (0.130333ms)
✔ build emits distinct osascript and Automator entrypoints (0.092542ms)
✔ Automator build emits the engine outside its thin run adapter (0.079708ms)
✔ Automator JXA object harness uses executable newlines and keeps original run (0.086ms)
✔ unique PDF and Office stems produce clean .md outputs in file and folder mode (3.224625ms)
✔ same stem across formats gets sequential Markdown names in directory mode (3.943458ms)
ℹ tests 25
ℹ suites 0
ℹ pass 24
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 238.158666

✖ failing tests:

test at tests/unit.test.ts:35:1
✖ batch parser rejects missing marker and invalid schema (1.053291ms)
  AssertionError [ERR_ASSERTION]: The input did not match the regular expression /marker/. Input:
  
  'Error: Missing structured batch JSON'
  
      at TestContext.<anonymous> (/Users/runner/work/AnydocVisionExportMarkdown/AnydocVisionExportMarkdown/tests/unit.test.ts:36:10)
      at Test.runInAsyncScope (node:async_hooks:227:14)
      at Test.run (node:internal/test_runner/test:1402:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
      at Test.postRun (node:internal/test_runner/test:1542:19)
      at Test.run (node:internal/test_runner/test:1467:12)
      at async Test.processPendingSubtests (node:internal/test_runner/test:974:7) {
    generatedMessage: true,
    code: 'ERR_ASSERTION',
    actual: Error: Missing structured batch JSON
        at extractBatchOutput (/Users/runner/work/AnydocVisionExportMarkdown/AnydocVisionExportMarkdown/tests/test-utils.ts:90:21)
        at <anonymous> (/Users/runner/work/AnydocVisionExportMarkdown/AnydocVisionExportMarkdown/tests/unit.test.ts:36:23)
        at getActual (node:assert:611:5)
        at strict.throws (node:assert:759:24)
        at TestContext.<anonymous> (/Users/runner/work/AnydocVisionExportMarkdown/AnydocVisionExportMarkdown/tests/unit.test.ts:36:10)
        at Test.runInAsyncScope (node:async_hooks:227:14)
        at Test.run (node:internal/test_runner/test:1402:25)
        at Test.processPendingSubtests (node:internal/test_runner/test:974:18)
        at Test.postRun (node:internal/test_runner/test:1542:19)
        at Test.run (node:internal/test_runner/test:1467:12),
    expected: /marker/,
    operator: 'throws',
    diff: 'simple'
  }

STDERR:


```

