// Rebuild on change and run Electron. Reload the window (Cmd/Ctrl+R) to pick up renderer edits;
// restart this script for main-process edits.
import { spawn } from 'node:child_process';

const build = spawn(process.execPath, ['build.mjs', '--watch'], { stdio: 'inherit' });
let electron;

// Give the first build a moment to land before launching.
setTimeout(() => {
  electron = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['electron', '.'], { stdio: 'inherit' });
  electron.on('exit', () => {
    build.kill();
    process.exit(0);
  });
}, 2500);

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    build.kill();
    electron?.kill();
    process.exit(0);
  });
}
