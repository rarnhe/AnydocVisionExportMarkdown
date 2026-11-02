import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dirname, '..');
const input = join(root, 'tests', 'chunk_1.pdf');
const out = join(root, 'tests', 'output');
const report = join(root, 'test_report.md');
const rows: { name: string; ok: boolean; detail: string }[] = [];
mkdirSync(out, { recursive: true });
function check(name: string, fn: () => void) {
  try { fn(); rows.push({name, ok:true, detail:'PASS'}); }
  catch (e) { rows.push({name, ok:false, detail:String(e).replace(/\|/g, '/')}); }
}
function run(command: string, args: string[]) {
  const r = spawnSync(command, args, {cwd:root, encoding:'utf8', timeout:180000, maxBuffer:32*1024*1024});
  if (r.error || r.status !== 0) throw new Error(`${command} exited ${r.status}: ${r.error || ''} ${(r.stderr||r.stdout||'').slice(-1200)}`);
}
function conversion(name: string, command: string, args: string[]) {
  check(name, () => {
    const md = input.replace(/\.pdf$/i, '.md');
    rmSync(md, {force:true});
    run(command,args);
    if (!existsSync(md)) throw new Error('Markdown output missing');
    const body = readFileSync(md,'utf8');
    if (body.trim().length < 30) throw new Error('Markdown output too short');
    if (/Direct JXA Export|Executed without WASM|MARKDOWN_OUTPUT_START|ERROR:/.test(body)) throw new Error('Placeholder/protocol/error output');
    if (body.includes('\uFFFD')) throw new Error('Invalid UTF-8 replacement characters');
    const hash = createHash('sha256').update(body).digest('hex');
    writeFileSync(join(out,name+'.md'),body);
    rows.push({name:name+' SHA256',ok:true,detail:hash});
    rmSync(md,{force:true});
  });
}
check('Fixture PDF', () => {
  if (!existsSync(input) || statSync(input).size < 1000 || readFileSync(input).subarray(0,5).toString() !== '%PDF-') throw new Error('Missing/invalid PDF fixture');
});
conversion('tsx CLI','npx',['--no-install','tsx','src/node/cli.ts',input]);
check('Build output', () => {
  run('node',['build.js']);
  const bundle=join(root,'dist','anydoc-wasm.jxa.js');
  if (!existsSync(bundle) || statSync(bundle).size < 1000) throw new Error('Bundle missing or too small');
});
conversion('Executable JXA',join(root,'dist','anydoc-wasm.jxa.js'),[input]);
conversion('osascript JXA','osascript',['-l','JavaScript',join(root,'dist','anydoc-wasm.jxa.js'),input]);
const conversions=rows.filter(r=>['tsx CLI','Executable JXA','osascript JXA'].includes(r.name));
if(conversions.every(r=>r.ok)){
  const files=['tsx CLI','Executable JXA','osascript JXA'].map(n=>readFileSync(join(out,n+'.md'),'utf8').trim());
  check('Three-mode content consistency',()=>{
    if(files.some(f=>f!==files[0])) throw new Error('Markdown content differs between modes');
  });
}
const ok=rows.every(r=>r.ok);
const md=['# 测试报告','',`- 平台：${process.platform} ${process.arch}`,`- Node：${process.version}`,`- 时间：${new Date().toISOString()}`,`- 结果：**${ok?'PASS':'FAIL'}**`,'','| 断言 | 状态 | 详情 |','|---|---|---|',...rows.map(r=>`| ${r.name} | ${r.ok?'PASS':'FAIL'} | ${r.detail.replace(/\n/g,' ')} |`),''].join('\n');
writeFileSync(report,md);
console.log(md);
if(!ok) process.exitCode=1;
