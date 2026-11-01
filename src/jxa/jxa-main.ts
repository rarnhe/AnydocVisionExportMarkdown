import { nativeGetEnv } from './cocoa-fs';
import { runJxaMode } from './task-router';

const isNodeRuntime = typeof process !== 'undefined' && Boolean(process.versions && process.versions.node);

if (isNodeRuntime && typeof require === 'function') {
  // 直接安全调用，esbuild 此时由于声明了 external 会将其作为外部 CommonJS 保留，不会发出警告
  const cp = require('child_process');
  const scriptPath = typeof __filename !== 'undefined' ? __filename : process.argv[1];
  const userArgs = process.argv.slice(2);

  try {
    cp.execFileSync('osascript', ['-l', 'JavaScript', scriptPath, '--', ...userArgs], {
      stdio: 'inherit',
    });
    process.exit(0);
  } catch (err: any) {
    process.exit(1);
  }
} else {
  const buildTarget = nativeGetEnv('BUILD_TARGET');
  const isJxa = typeof ObjC !== 'undefined';

  if (buildTarget === 'jxa' || isJxa) {
    runJxaMode();
  }
}