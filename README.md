# AnydocVisionExportMarkdown

macOS JXA + JavaScriptCore + WASM PDF-to-Markdown batch converter.

## Architecture

Node (development entry) builds and launches JXA; standalone `dist/anydoc-wasm.jxa.js` launches JXA without Node. JXA enumerates every PDF in the specified directory, reads one PDF at a time through the native macOS `/usr/bin/base64` utility and sends its bytes to a single JSC child process via stdin. The JSC process initializes the embedded WASM exactly once, loops over PDF inputs, calls `toMarkdownBytes(bytes, 'pdf')`, and prints Markdown result markers. JXA writes a matching `.md` beside each PDF. PDF bytes are not compiled into the distributable JS. The WASM has no direct macOS filesystem access.

## Usage

```bash
npm ci
npx tsx src/node/cli.ts ./tests
node build.js
./dist/anydoc-wasm.jxa.js ./tests
osascript -l JavaScript ./dist/anydoc-wasm.jxa.js ./tests
bash tests/test_batch.sh
```

The program scans only the immediate directory; it includes every PDF including `test.pdf`. WASM is embedded into the single JS bundle. No additional npm dependencies were introduced.

The test script creates five temporary copies of `chunk_1.pdf`, tests every PDF under `tests/` in three modes, checks `BATCH_SUMMARY ... WASM_INIT=1 JSC_PROCESS=1`, compares outputs and writes `test_report.md`. Logs and per-mode Markdown copies go to `tests/output/`. Only the temporary PDF copies are removed; original PDFs remain intact.

The CI workflow runs on `macos-latest`, uploads reports even on failure, and writes back only `test_report.md` on feature-branch pushes. The report path is ignored to avoid an Actions feedback loop.
