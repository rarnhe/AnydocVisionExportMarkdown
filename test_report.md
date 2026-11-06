# JXA — macOS 能力边界实测

- 测试时间 (UTC): 2026-11-06T08:22:12.426Z
- 系统: ProductName:		macOS; ProductVersion:		26.6.2; BuildVersion:		25G83
- Node.js: v24.22.1
- GitHub SHA: cb03f9ca52b174b53b065dc673968b6eef392da8
- GitHub Run: 42187153866

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

## 真实目录镜像转换

- **FAIL**：FAIL: Error: jxa exit=1: /Users/runner/work/AnydocVisionExportMarkdown/AnydocVisionExportMarkdown/dist/anydoc-wasm.jxa.js: execution error: Error: TypeError: attrs.objectForKey is not a function. (In 'attrs.objectForKey($.NSFileType)', 'attrs.objectForKey' is undefined) (-2700) 
- 详细日志：tests/output/directory-*.log

## CI 最终阶段状态

- npm ci: **SUCCESS**
- Doctor: **SUCCESS**
- TypeScript typecheck: **SUCCESS**
- Unit tests + JXA probe: **SUCCESS**
- Node/JXA recursive directory SHA256: **FAILURE**

## 失败日志摘要


### Probes

```text
unavailable: 宿主未暴露 API；error: API 存在但调用失败；not_tested: 涉及授权/交互而主动跳过。
```

### Directory

```text
FAIL: Error: jxa exit=1: /Users/runner/work/AnydocVisionExportMarkdown/AnydocVisionExportMarkdown/dist/anydoc-wasm.jxa.js: execution error: Error: TypeError: attrs.objectForKey is not a function. (In 'attrs.objectForKey($.NSFileType)', 'attrs.objectForKey' is undefined) (-2700) 
```
