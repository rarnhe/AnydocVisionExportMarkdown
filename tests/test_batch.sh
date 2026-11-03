#!/usr/bin/env bash
set -u
shopt -s nullglob
mkdir -p tests/output
REPORT=test_report.md
printf '# 批量转换测试报告\n\n- 平台：%s\n- 时间：%s\n\n| 阶段 | 结果 | 详情 |\n|---|---|---|\n' "$(uname -s)" "$(date -u +%FT%TZ)" > "$REPORT"
failed=0
record(){ printf '| %s | %s | %s |\n' "$1" "$2" "$3" >> "$REPORT"; }

if [ ! -s tests/chunk_1.pdf ]; then
  record fixture FAIL '缺少 tests/chunk_1.pdf，无法创建批量样本'
  cat "$REPORT"
  exit 1
fi

# Create five additional fixtures, then treat every PDF in tests/ equally.
copies=()
for n in 1 2 3 4 5; do
  copy="tests/chunk_1_copy_${n}.pdf"
  cp tests/chunk_1.pdf "$copy"
  copies+=("$copy")
done
pdfs=(tests/*.[pP][dD][fF])
if [ "${#pdfs[@]}" -eq 0 ]; then
  record discovery FAIL 'tests/ 中没有 PDF 文件'
  exit 1
fi

check_outputs(){
  local mode="$1" count=0 bad=0
  mkdir -p "tests/output/$mode"
  for pdf in "${pdfs[@]}"; do
    local md="${pdf%.*}.md"
    if [ -s "$md" ] && ! grep -Eq 'Direct JXA Export|Executed without WASM|BATCH_ERROR|BATCH_FATAL' "$md"; then
      cp "$md" "tests/output/$mode/$(basename "$md")"
      count=$((count+1))
    else
      bad=$((bad+1))
    fi
  done
  if [ "$bad" -eq 0 ]; then record "$mode" PASS "$count/${#pdfs[@]} 个 PDF 均生成 Markdown"; else record "$mode" FAIL "$count/${#pdfs[@]} 个 Markdown 成功"; failed=1; fi
}
clean_outputs(){
  for pdf in "${pdfs[@]}"; do rm -f "${pdf%.*}.md"; done
}

record discovery PASS "发现 ${#pdfs[@]} 个 PDF，未按文件名排除任何文件"
clean_outputs
npx --no-install tsx src/node/cli.ts ./tests > tests/output/tsx.log 2>&1
code=$?
check_outputs tsx
if [ "$code" -ne 0 ]; then record 'tsx exit' FAIL "$code"; failed=1; fi

clean_outputs
node build.js > tests/output/build.log 2>&1
code=$?
if [ "$code" -eq 0 ] && [ -s dist/anydoc-wasm.jxa.js ]; then
  record build PASS '单文件 JS bundle 已生成；WASM 已内嵌'
else
  record build FAIL "exit=$code"; failed=1
fi

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
  for pdf in "${pdfs[@]}"; do
    name="$(basename "${pdf%.*}.md")"
    cmp -s "tests/output/tsx/$name" "tests/output/executable/$name" &&
    cmp -s "tests/output/tsx/$name" "tests/output/osascript/$name" || failed=1
  done
fi
if [ "$failed" -eq 0 ]; then
  record consistency PASS "全部 ${#pdfs[@]} 个 PDF 在三种模式下输出一致"
else
  record consistency FAIL '部分断言失败，请检查 tests/output 日志'
fi

# Remove only the five fixtures created by this test. Existing PDFs (including test.pdf) remain untouched.
rm -f "${copies[@]}"
cat "$REPORT"
exit "$failed"
