import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
export function runNodeMode():void{
  const arg=process.argv[2];
  if(!arg){console.error('Usage: npx tsx src/node/cli.ts <PDF directory>');process.exitCode=1;return;}
  const folder=path.resolve(arg);
  if(!fs.existsSync(folder)||!fs.statSync(folder).isDirectory()){console.error('Directory not found: '+folder);process.exitCode=1;return;}
  try{
    cp.execFileSync(process.execPath,[path.resolve(__dirname,'../../build.js')],{stdio:'inherit'});
    cp.execFileSync('osascript',['-l','JavaScript',path.resolve(__dirname,'../../dist/anydoc-wasm.jxa.js'),'--',folder],{stdio:'inherit'});
  }catch(e){console.error('Batch conversion failed:',e);process.exitCode=1;}
}
if(require.main===module)runNodeMode();
