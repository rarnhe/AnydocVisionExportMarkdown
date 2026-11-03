#!/usr/bin/env bash
set -u
mkdir -p tests/output
REPORT=test_report.md
printf '# 批量转换测试报告\n\n- 平台：%s\n- 时间：%s\n\n| 阶段 | 结果 | 详情 |\n|---|---|---|\n' "$(uname -s)" "$(date -u +%FT%TZ)" > "$REPORT"
failed=0
record(){ printf '| %s | %s | %s |\n' "$1" "$2" "$3" >> "$REPORT"; }
if [ ! -s tests/chunk_1.pdf ]; then record fixture FAIL '缺少 tests/chunk_1.pdf'; exit 1; fi
# Five copies plus the original, all under tests; do not touch test.pdf.
for n in 1 2 3 4 5; do cp tests/chunk_1.pdf "tests/chunk_1_copy_${n}.pdf"; done
check_outputs(){
  local mode="$1" count=0 bad=0
  for pdf in tests/chunk_1.pdf tests/chunk_1_copy_{1..5}.pdf; do
    local md="${pdf%.pdf}.md"
    if [ -s "$md" ] && ! grep -Eq 'Direct JXA Export|Executed without WASM|BATCH_ERROR|BATCH_FATAL' "$md"; then
      mkdir -p "tests/output/$mode"
      cp "$md" "tests/output/$mode/$(basename "$md")"
      count=$((count+1))
    else bad=$((bad+1)); fi
  done
  if [ "$bad" -eq 0 ]; then record "$mode" PASS "$count/6 Markdown files"; else record "$mode" FAIL "$count/6 Markdown files"; failed=1; fi
}
clean_outputs(){ rm -f tests/chunk_1.md tests/chunk_1_copy_{1..5}.md; }
clean_outputs
npx --no-install tsx src/node/cli.ts ./tests > tests/output/tsx.log 2>&1
code=$?
check_outputs tsx
if [ "$code" -ne 0 ]; then record 'tsx exit' FAIL "$code"; failed=1; fi
clean_outputs
node build.js > tests/output/build.log 2>&1
code=$?
if [ "$code" -eq 0 ] && [ -s dist/anydoc-wasm.jxa.js ] && ! grep -q "anydoc_core.wasm" dist/anydoc-wasm.jxa.js; then
  record build PASS '单文件 JS bundle 已生成；WASM 已内嵌'
else record build FAIL "exit=$code"; failed=1; fi
clean_outputs
./dist/anydoc-wasm.jxa.js ./tests > tests/output/executable.log 2>&1
code=$?
check_outputs executable
if [ "$code" -ne 0 ]; then record 'executable exit' FAIL "$code"; failed=1; fi
clean_outputs
osascript -l JavaScript ./dist/anydoc-wasm.jxa.js ./tests > tests/output/osascript.log 2>&1
code=$?
check_outputs osascript
if [ "$code" -ne 0 ]; then record 'osascript exit' FAIL "$code"; failed=1; fi
if [ "$failed" -eq 0 ]; then
  for pdf in tests/chunk_1.pdf tests/chunk_1_copy_{1..5}.pdf; do
    name="$(basename "${pdf%.pdf}.md")"
    cmp -s "tests/output/tsx/$name" "tests/output/executable/$name" &&
    cmp -s "tests/output/tsx/$name" "tests/output/osascript/$name" || failed=1
  done
fi
if [ "$failed" -eq 0 ]; then record consistency PASS 'all six outputs identical across modes'; else record consistency FAIL 'some assertions failed; inspect logs'; fi
# Keep test.pdf and original fixture untouched; remove only generated copies.
rm -f tests/chunk_1_copy_{1..5}.pdf
cat "$REPORT"
exit "$failed"
