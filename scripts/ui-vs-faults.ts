import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { controls, reconstructedFaults, visualFaults, type Fault } from './faults';

const require = createRequire(import.meta.url);
const dist = path.resolve('dist/renderer');
const files = ['styles.css', 'app.js'] as const;
const args = process.argv.slice(2);
const reconstructedMode = args.includes('--reconstructed');
const only = args.find((arg) => arg.startsWith('--only='))?.slice('--only='.length);
const faults = (reconstructedMode ? reconstructedFaults : visualFaults).filter((fault) => !only || fault.id === only);
const selectedControls = controls.filter((fault) => !only || fault.id === only);
const outputName = reconstructedMode ? 'ui-reconstructed.json' : 'ui-vs-faults.json';
const testCount = 27;

function inject(fault: Fault) {
  const styles = path.join(dist, 'styles.css');
  const app = path.join(dist, 'app.js');
  if (fault.css) writeFileSync(styles, `${readFileSync(styles, 'utf8')}\n${fault.css}\n`);
  if (fault.js) {
    const wrapped = `\nwindow.addEventListener('DOMContentLoaded',()=>{${fault.js}});\n`;
    writeFileSync(app, `${readFileSync(app, 'utf8')}${wrapped}`);
  }
}

function runUiTests() {
  const cli = require.resolve('@playwright/test/cli');
  const result = spawnSync(process.execPath, [cli, 'test', '--project=ui', '--reporter=line'], {
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const output = `${result.stdout}\n${result.stderr}`.replace(/\u001b\[[0-9;]*m/g, '');
  const passed = Number(output.match(/(\d+) passed(?:\s*\()/)?.[1] ?? 0);
  const skipped = Number(output.match(/(\d+) skipped(?:\s*\()/)?.[1] ?? 0);
  const reportedFailed = Number(output.match(/(\d+) failed(?:\s*\()/)?.[1] ?? 0);
  const failed = Math.max(reportedFailed, result.status !== 0 ? testCount - passed - skipped : 0);
  return {
    exitCode: result.status,
    passed,
    failed,
    skipped,
    expectedTests: testCount,
    outputTail: output.split(/\r?\n/).slice(-10).join('\n'),
  };
}

function saveOriginals() {
  const originals = new Map<string, Buffer>();
  for (const file of files) originals.set(file, Buffer.from(readFileSync(path.join(dist, file))));
  return () => {
    for (const [file, contents] of originals) writeFileSync(path.join(dist, file), contents);
  };
}

async function main() {
  const restore = saveOriginals();
  const results: Array<{ id: string; name: string; kind: string; briefReference: string | null; ui: ReturnType<typeof runUiTests> }> = [];
  try {
    for (const fault of [...faults, ...selectedControls]) {
      restore();
      inject(fault);
      console.log(`Running UI suite for ${fault.id}`);
      const ui = runUiTests();
      console.log(`${fault.id}: ${ui.passed} passed, ${ui.failed} failed (exit ${ui.exitCode})`);
      results.push({
        id: fault.id,
        name: fault.name,
        kind: fault.kind,
        briefReference: fault.briefReference ?? null,
        ui,
      });
    }
  } finally {
    restore();
  }

  const controlIds = new Set(controls.map((fault) => fault.id));
  const control = results.find((result) => result.id === 'hide-navigation');
  const result = {
    study: {
      runner: '27 Playwright UI tests per fault',
      expectedTestCount: testCount,
      mode: reconstructedMode ? 'reconstructed examples based on supplied descriptions' : 'injected visual faults and controls',
    },
    faults: results.filter((result) => !controlIds.has(result.id)),
    controls: results.filter((result) => controlIds.has(result.id)),
  };
  const out = path.resolve('study/data');
  writeFileSync(path.join(out, outputName), JSON.stringify(result, null, 2) + '\n');
  if (!only && (control?.ui.exitCode === 0 || !control)) {
    throw new Error('Control fault .nav-link { display: none } was expected to fail UI tests.');
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
