# 批量转换测试报告

- 平台：Darwin
- 时间：2026-11-03T16:46:28Z

| 阶段 | 结果 | 详情 |
|---|---|---|
| discovery | PASS | 发现 7 个 PDF，未按文件名排除任何文件 |
| tsx | FAIL | 6/7 个 Markdown 成功 |
| tsx exit | FAIL | 1 |
| build | PASS | 单文件 JS bundle 已生成；WASM 已内嵌 |
| executable | FAIL | 6/7 个 Markdown 成功 |
| executable exit | FAIL | 1 |
| osascript | FAIL | 6/7 个 Markdown 成功 |
| osascript exit | FAIL | 1 |
| consistency | FAIL | 部分断言失败，请检查 tests/output 日志 |

## CI 状态
- Dependencies: success
- Tests: failure
