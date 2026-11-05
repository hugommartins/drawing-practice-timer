import type { SetupConfig } from './types';

export interface Clock {
  now(): number;
}

export type Rng = () => number;

/** Fisher–Yates. Returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export interface RunnerOptions {
  setup: SetupConfig;
  images: readonly string[];
  clock: Clock;
  rng?: Rng;
  /**
   * Longest gap between two ticks that still counts as drawing time. A bigger gap means the
   * computer slept or the window was frozen, and that time is not credited. Default 10 s.
   */
  maxGapMs?: number;
}

export type RunnerStatus = 'running' | 'paused' | 'complete';

export interface RunnerSnapshot {
  status: RunnerStatus;
  /** Index into the played sequence, 0-based. */
  position: number;
  /** Images shown so far, counting the current one. */
  shown: number;
  /** Total images planned, or 0 for open-ended. */
  planned: number;
  current: string | null;
  /** Seconds left on the current countdown, or null when there is none. */
  remaining: number | null;
  /** Seconds spent on the current image. */
  imageElapsed: number;
  /** Seconds spent drawing this sitting (excludes pauses). */
  totalElapsed: number;
  /** Seconds the active countdown started from (per image or whole sitting), or null. */
  countdownTotal: number | null;
}

/**
 * Drives one drawing sitting. Pure and deterministic: all time comes from the injected clock
 * and all randomness from the injected rng, so it can be tested without waiting.
 *
 * No repeats: the pool is shuffled once and walked in order. When an open-ended session
 * exhausts the folder, it reshuffles and carries on.
 */
export class SessionRunner {
  private readonly setup: SetupConfig;
  private readonly pool: readonly string[];
  private readonly clock: Clock;
  private readonly rng: Rng;
  private readonly maxGapMs: number;
  private played: string[] = [];
  private position = 0;
  private cycle: string[] = [];
  private cycleIdx = 0;
  private imageElapsedMs = 0;
  private totalElapsedMs = 0;
  private countdownBonusMs = 0;
  private lastTick: number;
  private status: RunnerStatus = 'running';
  private imageBudgetMs: number | null;

  constructor(opts: RunnerOptions) {
    this.setup = opts.setup;
    this.pool = opts.images;
    this.clock = opts.clock;
    this.rng = opts.rng ?? Math.random;
    this.maxGapMs = opts.maxGapMs ?? 10_000;
    this.lastTick = this.clock.now();
    this.imageBudgetMs = this.setup.mode === 'per-image' ? this.setup.perImageSec * 1000 : null;
    this.cycle = shuffle(this.pool, this.rng);
    if (this.pool.length === 0) this.status = 'complete';
    else this.played.push(this.draw());
  }

  private draw(): string {
    if (this.cycleIdx >= this.cycle.length) {
      this.cycle = shuffle(this.pool, this.rng);
      this.cycleIdx = 0;
    }
    return this.cycle[this.cycleIdx++]!;
  }

  private planned(): number {
    if (this.setup.mode !== 'per-image') return 0;
    return this.setup.count === 0 ? 0 : Math.min(this.setup.count, this.pool.length || this.setup.count);
  }

  /** Advance the clock. Call on every animation frame or interval. */
  tick(): RunnerSnapshot {
    const now = this.clock.now();
    const dt = Math.min(this.maxGapMs, Math.max(0, now - this.lastTick));
    this.lastTick = now;
    if (this.status === 'running') {
      this.imageElapsedMs += dt;
      this.totalElapsedMs += dt;
      this.applyLimits();
    }
    return this.snapshot();
  }

  private applyLimits(): void {
    if (this.setup.mode === 'whole') {
      if (this.totalElapsedMs >= this.setup.totalSec * 1000 + this.countdownBonusMs) {
        this.totalElapsedMs = this.setup.totalSec * 1000 + this.countdownBonusMs;
        this.status = 'complete';
      }
      return;
    }
    if (this.setup.mode === 'per-image' && this.imageBudgetMs !== null) {
      // A long gap (e.g. laptop sleep) can skip several images; carry the overflow forward.
      let guard = 0;
      while (this.status === 'running' && this.imageElapsedMs >= this.imageBudgetMs && guard++ < 10000) {
        const overflow = this.imageElapsedMs - this.imageBudgetMs;
        if (!this.advance()) {
          this.totalElapsedMs -= overflow;
          this.imageElapsedMs = this.imageBudgetMs;
          break;
        }
        this.imageElapsedMs = overflow;
      }
    }
  }

  /** Move to the next image. Returns false when the session is over. */
  private advance(): boolean {
    const planned = this.planned();
    if (planned > 0 && this.position + 1 >= planned) {
      this.status = 'complete';
      return false;
    }
    if (this.position + 1 < this.played.length) {
      this.position++;
    } else {
      this.played.push(this.draw());
      this.position++;
    }
    this.imageElapsedMs = 0;
    if (this.setup.mode === 'per-image') this.imageBudgetMs = this.setup.perImageSec * 1000;
    return true;
  }

  next(): RunnerSnapshot {
    this.tick();
    if (this.status !== 'complete') {
      const wasPaused = this.status === 'paused';
      this.advance();
      // advance() may have ended the session; only restore 'paused' if it didn't.
      if (wasPaused && (this.status as RunnerStatus) !== 'complete') this.status = 'paused';
    }
    return this.snapshot();
  }

  prev(): RunnerSnapshot {
    this.tick();
    if (this.status !== 'complete' && this.position > 0) {
      this.position--;
      this.imageElapsedMs = 0;
      if (this.setup.mode === 'per-image') this.imageBudgetMs = this.setup.perImageSec * 1000;
    }
    return this.snapshot();
  }

  pause(): RunnerSnapshot {
    this.tick();
    if (this.status === 'running') this.status = 'paused';
    return this.snapshot();
  }

  resume(): RunnerSnapshot {
    this.tick();
    if (this.status === 'paused') this.status = 'running';
    return this.snapshot();
  }

  toggle(): RunnerSnapshot {
    return this.status === 'paused' ? this.resume() : this.pause();
  }

  /** Add (or remove, with a negative value) seconds on the active countdown. */
  addTime(seconds: number): RunnerSnapshot {
    this.tick();
    const ms = seconds * 1000;
    if (this.setup.mode === 'per-image' && this.imageBudgetMs !== null) {
      this.imageBudgetMs = Math.max(1000, this.imageBudgetMs + ms);
    } else if (this.setup.mode === 'whole') {
      this.countdownBonusMs = Math.max(-(this.setup.totalSec * 1000 - 1000), this.countdownBonusMs + ms);
    }
    return this.snapshot();
  }

  /** Stop now. Time already drawn is kept. */
  finish(): RunnerSnapshot {
    this.tick();
    this.status = 'complete';
    return this.snapshot();
  }

  snapshot(): RunnerSnapshot {
    const mode = this.setup.mode;
    let remaining: number | null = null;
    let countdownTotal: number | null = null;
    if (mode === 'per-image' && this.imageBudgetMs !== null) {
      remaining = Math.max(0, (this.imageBudgetMs - this.imageElapsedMs) / 1000);
      countdownTotal = this.imageBudgetMs / 1000;
    } else if (mode === 'whole') {
      const budget = this.setup.totalSec * 1000 + this.countdownBonusMs;
      remaining = Math.max(0, (budget - this.totalElapsedMs) / 1000);
      countdownTotal = budget / 1000;
    }
    return {
      status: this.status,
      position: this.position,
      shown: this.played.length,
      planned: this.planned(),
      current: this.played[this.position] ?? null,
      remaining,
      imageElapsed: this.imageElapsedMs / 1000,
      totalElapsed: this.totalElapsedMs / 1000,
      countdownTotal,
    };
  }

  /** Images the user has actually been shown (the furthest one reached counts). */
  imagesShown(): number {
    return this.played.length;
  }

  /** The sequence played so far, in order. Never contains a repeat within one pass of the folder. */
  history(): readonly string[] {
    return this.played;
  }
}
