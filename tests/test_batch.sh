#!/usr/bin/env bash
set -u
shopt -s nullglob
mkdir -p tests/output
report=test_report.md
printf '# JSC 单例批量测试报告\n\n- macOS: %s\n- 时间: %s\n\n| 测试 | 结果 | 说明 |\n|---|---|---|\n' "$(sw_vers -productVersion 2>/dev/null || uname -s)" "$(date -u +%FT%TZ)" > "$report"
failed=0
record(){ printf '| %s | %s | %s |\n' "$1" "$2" "$3" >> "$report"; }
if [ ! -s tests/chunk_1.pdf ]; then record fixture FAIL 'chunk_1.pdf missing'; cat "$report"; exit 1; fi
copies=()
for i in 1 2 3 4 5; do file="tests/chunk_1_copy_${i}.pdf"; cp tests/chunk_1.pdf "$file"; copies+=("$file"); done
pdfs=(tests/*.[pP][dD][fF])
record discovery PASS "${#pdfs[@]} PDF files, no exclusions"
cleanup(){ rm -f "${copies[@]}"; }
trap cleanup EXIT
clean_md(){ for pdf in "${pdfs[@]}"; do rm -f "${pdf%.*}.md"; done; }
check(){
  local mode="$1" status="$2" count=0
  mkdir -p "tests/output/$mode"
  for pdf in "${pdfs[@]}"; do
    md="${pdf%.*}.md"
    if [ -s "$md" ] && ! grep -Eq 'Direct JXA Export|Executed without WASM|BATCH_ERROR|BATCH_FATAL' "$md"; then
      cp "$md" "tests/output/$mode/$(basename "$md")"
      count=$((count+1))
    fi
  done
  if [ "$status" -eq 0 ] && [ "$count" -eq "${#pdfs[@]}" ] && grep -q "BATCH_SUMMARY ${#pdfs[@]}/${#pdfs[@]} WASM_INIT=1 JSC_PROCESS=1" "tests/output/$mode.log"; then
    record "$mode" PASS "$count/${#pdfs[@]} Markdown; one JSC and WASM"
  else
    record "$mode" FAIL "exit=$status; $count/${#pdfs[@]} Markdown; see tests/output/$mode.log"
    failed=1
  fi
}
clean_md
npx --no-install tsx src/node/cli.ts ./tests > tests/output/tsx.log 2>&1
check tsx "$?"
clean_md
node build.js > tests/output/build.log 2>&1
status=$?
if [ "$status" -eq 0 ] && [ -s dist/anydoc-wasm.jxa.js ]; then record build PASS 'single executable bundle'; else record build FAIL "exit=$status"; failed=1; fi
clean_md
./dist/anydoc-wasm.jxa.js ./tests > tests/output/executable.log 2>&1
check executable "$?"
clean_md
osascript -l JavaScript ./dist/anydoc-wasm.jxa.js ./tests > tests/output/osascript.log 2>&1
check osascript "$?"
if [ "$failed" -eq 0 ]; then
  for pdf in "${pdfs[@]}"; do
    name="$(basename "${pdf%.*}.md")"
    cmp -s "tests/output/tsx/$name" "tests/output/executable/$name" &&
    cmp -s "tests/output/tsx/$name" "tests/output/osascript/$name" || failed=1
  done
fi
if [ "$failed" -eq 0 ]; then record consistency PASS 'All PDF Markdown outputs match'; else record consistency FAIL 'Missing or differing outputs'; fi
cat "$report"
exit "$failed"
