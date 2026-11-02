# macOS 测试报告

- Runner: macOS
- 时间: 2026-11-02T15:39:01Z

ProductName:		macOS
ProductVersion:		26.6.2
BuildVersion:		25G83

## 四阶段测试断言
| 阶段 | 结果 | 详情 |
|---|---|---|
| tsx | PASS | exit=0; Markdown 已生成 |
| esbuild | PASS | dist/anydoc-wasm.jxa.js 已生成 |
| executable | PASS | exit=0; Markdown 已生成 |
| osascript | PASS | exit=0; Markdown 已生成 |
| 输出一致性 | PASS | 三种方式输出相同 |

## CI 步骤状态
- Dependencies: success
- Assertions: success
