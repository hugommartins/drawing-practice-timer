// Runs the performance lane. Usage:
//   node scripts/perf.mjs [unit|ui|e2e|all] [--update] [--sizes=1000,10000]
// --update   record baselines for this machine into tests/perf/baselines.json (5 repeats per metric)
// --sizes    override the library sizes for this run (default: unit 1k-100k, ui and e2e 1k-50k)
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const lanes = args.find((a) => ['unit', 'ui', 'e2e', 'all'].includes(a)) ?? 'all';
const env = { ...process.env, PERF_RUN_ID: String(Date.now()) };
if (args.includes('--update')) env.PERF_UPDATE = '1';
const sizes = args.find((a) => a.startsWith('--sizes='));
if (sizes) env.PERF_SIZES = sizes.slice('--sizes='.length);

const run = (label, cmd, argv) => {
  console.log(`\n== perf: ${label}`);
  const r = spawnSync(cmd, argv, { stdio: 'inherit', env });
  return r.status ?? 1;
};

const want = (l) => lanes === 'all' || lanes === l;
let failed = 0;

if (want('ui') || want('e2e')) {
  if (run('build', process.execPath, ['build.mjs']) !== 0) process.exit(1);
}
if (want('unit')) {
  const files = readdirSync('tests/perf').filter((f) => f.endsWith('.unit.perf.ts')).map((f) => join('tests/perf', f));
  failed += run('unit', process.execPath, [join('node_modules', 'tsx', 'dist', 'cli.mjs'), '--expose-gc', '--test', '--test-concurrency=1', ...files]);
}
const pw = join('node_modules', 'playwright', 'cli.js');
if (want('ui')) failed += run('ui', process.execPath, [pw, 'test', '--project=perf-ui']);
if (want('e2e')) failed += run('e2e (Electron)', process.execPath, [pw, 'test', '--project=perf-electron']);

// One-screen summary of what was recorded.
let rows = [];
for (const lane of ['unit', 'ui', 'e2e']) {
  const f = join('tests/perf/results', `${lane}.json`);
  if (want(lane) && existsSync(f)) rows = rows.concat(JSON.parse(readFileSync(f, 'utf8')).outcomes);
}
const count = (s) => rows.filter((r) => r.status === s).length;
if (rows.length) {
  console.log(`\nperf summary: ${rows.length} metrics. within budget ${count('ok')}, over ${count('over')}, measured without a baseline ${count('measured')}, info only ${count('info')}, baselines recorded ${count('baseline')}.`);
  if (count('measured')) console.log('No baseline yet for some metrics: run "npm run perf:baseline" on this machine, then commit tests/perf/baselines.json.');
  console.log('Raw numbers: tests/perf/results/*.json');
}
process.exit(failed ? 1 : 0);
