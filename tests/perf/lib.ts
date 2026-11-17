/**
 * Shared helpers for the performance lane (see TEST_STRATEGY.md, "Performance with large libraries").
 *
 * Rules this file enforces, so each test only says what to measure:
 *   - A measurement is the median of several runs after a warm-up.
 *   - Budgets are never typed into a test. A budget is `baseline + 3 x noise`, both read from
 *     baselines.json for this machine class (platform, plus "-ci" on CI). Baselines are recorded with
 *     `npm run perf:baseline`, which repeats every measurement and stores the spread as the noise.
 *   - With no baseline for a metric, the run only records it ("measured") and passes.
 *   - A measurement over budget is repeated once; only a second miss fails the test.
 *   - Every number, with its raw samples, is written to tests/perf/results/<lane>.json.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type Unit = 'ms' | 'MB' | 'KB' | 'bytes' | 'count';

export interface MetricOpts {
  unit: Unit;
  /** Record only. Never gated, even when a baseline exists. For "is this a hotspot?" questions. */
  info?: boolean;
  /** Medians per measurement (default 5). */
  runs?: number;
  /** Discarded runs before measuring (default 1). */
  warmup?: number;
}

export interface Baseline {
  value: number;
  /** Largest minus smallest of the repeated medians, never below NOISE_FLOOR x value (0 for counts). */
  noise: number;
  unit: Unit;
  n: number;
}

export interface Outcome {
  name: string;
  unit: Unit;
  value: number;
  samples: number[];
  status: 'measured' | 'ok' | 'over' | 'info' | 'baseline';
  baseline?: number;
  budget?: number;
  retried?: boolean;
}

/** A few quiet runs understate noise, so a recorded baseline keeps at least this share of its value. */
export const NOISE_FLOOR = 0.05;
export const NOISE_MULTIPLE = 3;
/** Repetitions of a whole measurement when recording a baseline. */
export const BASELINE_REPEATS = 5;

export const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)]! : 0;
}

export const budgetOf = (b: Baseline): number => b.value + NOISE_MULTIPLE * b.noise;

export function machineTag(): string {
  return `${process.platform}${process.env['CI'] ? '-ci' : ''}`;
}

export function envSummary() {
  return {
    tag: machineTag(),
    platform: `${process.platform} ${os.release()} ${process.arch}`,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    cores: os.cpus().length,
    memGB: Math.round(os.totalmem() / 2 ** 30),
    node: process.version,
  };
}

export class PerfBudgetError extends Error {}

export interface PerfOptions {
  lane: string;
  baselinesFile?: string;
  resultsDir?: string;
  tag?: string;
  update?: boolean;
}

const HERE = __dirname;

export function createPerf(o: PerfOptions) {
  const baselinesFile = o.baselinesFile ?? path.join(HERE, 'baselines.json');
  const resultsDir = o.resultsDir ?? path.join(HERE, 'results');
  const tag = o.tag ?? machineTag();
  const update = o.update ?? process.env['PERF_UPDATE'] === '1';
  const outcomes: Outcome[] = [];

  const readBaselines = (): Record<string, Record<string, Baseline>> => {
    try {
      return JSON.parse(readFileSync(baselinesFile, 'utf8'));
    } catch {
      return {};
    }
  };

  /** Test files of one lane run in separate processes; they share a results file within one run. */
  const runId = process.env['PERF_RUN_ID'] ?? String(process.ppid);

  function flush(): void {
    mkdirSync(resultsDir, { recursive: true });
    const file = path.join(resultsDir, `${o.lane}.json`);
    let prior: Outcome[] = [];
    try {
      const j = JSON.parse(readFileSync(file, 'utf8'));
      if (j.runId === runId) prior = j.outcomes;
    } catch {
      /* first write of this run */
    }
    const merged = [...prior.filter((p) => !outcomes.some((x) => x.name === p.name)), ...outcomes];
    writeFileSync(
      file,
      JSON.stringify({ lane: o.lane, runId, at: new Date().toISOString(), env: envSummary(), update, outcomes: merged }, null, 2) + '\n',
    );
  }

  function remember(out: Outcome): Outcome {
    const i = outcomes.findIndex((x) => x.name === out.name);
    if (i >= 0) outcomes[i] = out;
    else outcomes.push(out);
    flush();
    const tail =
      out.status === 'ok' ? ` (budget ${fmt(out.budget!, out.unit)})`
      : out.status === 'over' ? ` OVER budget ${fmt(out.budget!, out.unit)}`
      : out.status === 'measured' ? ' (no baseline yet)'
      : out.status === 'baseline' ? ' (recorded)'
      : '';
    console.log(`perf ${out.name}: ${fmt(out.value, out.unit)}${tail}`);
    return out;
  }

  /** One measurement: warm-up, then the median of `runs` samples. */
  async function group(sample: () => number | Promise<number>, runs: number, warmup: number) {
    for (let i = 0; i < warmup; i++) await sample();
    const samples: number[] = [];
    for (let i = 0; i < runs; i++) samples.push(await sample());
    return { value: median(samples), samples };
  }

  function saveBaseline(name: string, b: Baseline): void {
    const all = readBaselines();
    (all[tag] ??= {})[name] = b;
    const sorted: typeof all = {};
    for (const t of Object.keys(all).sort()) {
      sorted[t] = {};
      for (const k of Object.keys(all[t]!).sort()) sorted[t]![k] = all[t]![k]!;
    }
    mkdirSync(path.dirname(baselinesFile), { recursive: true });
    writeFileSync(baselinesFile, JSON.stringify(sorted, null, 2) + '\n');
  }

  /**
   * Measure `sample` (one run, returns a number) and gate it against the stored baseline.
   * Throws PerfBudgetError when a repeat also misses the budget.
   */
  async function measure(name: string, sample: () => number | Promise<number>, opts: MetricOpts): Promise<Outcome> {
    const runs = opts.runs ?? 5;
    const warmup = opts.warmup ?? 1;

    if (update && !opts.info) {
      const groups = [];
      for (let i = 0; i < BASELINE_REPEATS; i++) groups.push(await group(sample, runs, i === 0 ? warmup : 0));
      const meds = groups.map((g) => g.value);
      const value = median(meds);
      const spread = Math.max(...meds) - Math.min(...meds);
      const floor = opts.unit === 'count' ? 0 : NOISE_FLOOR * value;
      saveBaseline(name, { value, noise: Math.max(spread, floor), unit: opts.unit, n: runs * BASELINE_REPEATS });
      return remember({ name, unit: opts.unit, value, samples: groups.flatMap((g) => g.samples), status: 'baseline' });
    }

    const first = await group(sample, runs, warmup);
    if (opts.info) return remember({ name, unit: opts.unit, ...first, status: 'info' });

    const base = readBaselines()[tag]?.[name];
    if (!base) return remember({ name, unit: opts.unit, ...first, status: 'measured' });

    const budget = budgetOf(base);
    if (first.value <= budget) return remember({ name, unit: opts.unit, ...first, status: 'ok', baseline: base.value, budget });

    const again = await group(sample, runs, 0);
    const out: Outcome = {
      name, unit: opts.unit, value: again.value, samples: [...first.samples, ...again.samples],
      status: again.value <= budget ? 'ok' : 'over', baseline: base.value, budget, retried: true,
    };
    remember(out);
    if (out.status === 'over') {
      throw new PerfBudgetError(
        `${name}: ${fmt(first.value, opts.unit)}, then ${fmt(again.value, opts.unit)} on a repeat; budget ${fmt(budget, opts.unit)} (baseline ${fmt(base.value, opts.unit)} for "${tag}")`,
      );
    }
    return out;
  }

  /** A number that is observed once (not repeatable): recorded, and gated only by an existing baseline. */
  async function observe(name: string, value: number, opts: MetricOpts): Promise<Outcome> {
    return measure(name, () => value, { ...opts, runs: 1, warmup: 0 });
  }

  return { measure, observe, outcomes, tag, readBaselines };
}

export function fmt(v: number, unit: Unit): string {
  if (unit === 'count' || unit === 'bytes') return `${Math.round(v).toLocaleString('en-US')}${unit === 'bytes' ? ' B' : ''}`;
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${unit}`;
}

// ---- test data ---------------------------------------------------------------------------------

export interface LibraryShape {
  images: number;
  layout: 'flat' | 'nested';
  /** Non-image files per image (default 0.1). */
  nonImageRatio?: number;
  /** Nested layout: folders per level and number of levels (defaults 8 and 3, so 512 leaf folders). */
  fanout?: number;
  depth?: number;
  /** What to write into image files. Default: nothing (a scan never reads contents). */
  content?: Buffer;
}

export interface Library {
  root: string;
  images: number;
  /** Images plus non-image files (hidden files not counted). */
  files: number;
  remove(): void;
}

const IMAGE_EXTS = ['.jpg', '.png', '.webp', '.JPEG', '.gif'];
const OTHER_EXTS = ['.txt', '.psd', '.xmp', '.json'];

/**
 * Builds a library in a temp directory. Names carry numeric suffixes so the natural-order rule is
 * exercised (img_2 before img_10). Call `remove()` when the test is done.
 */
export function makeLibrary(shape: LibraryShape): Library {
  const root = mkdtempSync(path.join(os.tmpdir(), 'perf-lib-'));
  const fan = shape.fanout ?? 8;
  const depth = shape.depth ?? 3;
  const leaves = shape.layout === 'flat' ? 1 : fan ** depth;
  const dirs: string[] = [];
  if (shape.layout === 'flat') dirs.push(root);
  else {
    for (let i = 0; i < leaves; i++) {
      const parts: string[] = [];
      let n = i;
      for (let d = 0; d < depth; d++) {
        parts.unshift(`folder_${n % fan}`);
        n = Math.floor(n / fan);
      }
      dirs.push(path.join(root, ...parts));
    }
    for (const d of dirs) mkdirSync(d, { recursive: true });
  }
  const body = shape.content ?? Buffer.alloc(0);
  const ratio = shape.nonImageRatio ?? 0.1;
  let others = 0;
  for (let i = 1; i <= shape.images; i++) {
    const dir = dirs[i % dirs.length]!;
    writeFileSync(path.join(dir, `img_${i}${IMAGE_EXTS[i % IMAGE_EXTS.length]}`), body);
    if (i % 1000 === 0) writeFileSync(path.join(dir, `.hidden_${i}.jpg`), body); // skipped by the scan
    if (ratio > 0 && i % Math.round(1 / ratio) === 0) {
      writeFileSync(path.join(dir, `notes_${i}${OTHER_EXTS[i % OTHER_EXTS.length]}`), '');
      others++;
    }
  }
  return {
    root,
    images: shape.images,
    files: shape.images + others,
    remove: () => rmSync(root, { recursive: true, force: true }),
  };
}

/** Sizes to test. `PERF_SIZES=1000,5000` overrides; the UI and Electron lanes stop at 50,000 by default. */
export function sizes(lane: 'unit' | 'ui' | 'e2e'): number[] {
  const env = process.env['PERF_SIZES'];
  if (env) return env.split(',').map((s) => Number(s.trim())).filter((n) => n > 0);
  return lane === 'unit' ? [1_000, 10_000, 50_000, 100_000] : [1_000, 10_000, 50_000];
}

/**
 * The prefix this app uses for its test environment variables (HATCHMARK_ today, PLCHLDR before the
 * rename), and the matching window global. Read from the main process source so a rename needs no edit here.
 */
export function appNames(): { prefix: string; global: string } {
  const src = readFileSync(path.resolve(HERE, '../../src/main/index.ts'), 'utf8');
  const m = /process\.env\.([A-Z0-9]+)_USER_DATA/.exec(src);
  if (!m) throw new Error('could not find the *_USER_DATA variable in src/main/index.ts');
  return { prefix: m[1]!, global: m[1]!.toLowerCase() };
}

/**
 * One scenario run feeding several metrics. `sampler(pick)` gives each metric its own sample function;
 * the scenario for sample k runs once, the first time any metric asks for it.
 */
export function shared<T>(run: () => Promise<T>) {
  const results: Promise<T>[] = [];
  return {
    sampler(pick: (t: T) => number): () => Promise<number> {
      let i = 0;
      return async () => {
        const k = i++;
        results[k] ??= run();
        return pick(await results[k]!);
      };
    },
  };
}
