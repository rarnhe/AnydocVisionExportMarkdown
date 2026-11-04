# JSC 单例批量测试报告

- 状态：**PENDING — 尚无本分支 macOS 批量测试结果**
- 基线：从 main 创建的独立功能分支
- 目标：JXA Foundation 解码 WASM 与读取 PDF；单个 JSC 进程初始化 WASM 一次并循环转换目录内所有 PDF
- 验证：`tests/test_batch.sh` 对全部 PDF 执行 tsx / executable / osascript 三模式，检查输出一致性与 `WASM_INIT=1 JSC_PROCESS=1`

> 注意：main 分支 2026-11-02 的 PASS 报告只覆盖旧的单 PDF 实现，不作为此 PR 的验证结论。等待 macos-latest CI 生成真实报告并更新此文件。
