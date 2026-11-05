import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SessionRunner, shuffle } from '../../src/shared/session';
import { DEFAULT_SETUP, type SetupConfig } from '../../src/shared/types';

class FakeClock {
  t = 1_000_000;
  now = () => this.t;
  /** Advance in 250 ms ticks, like the UI does. */
  run(runner: SessionRunner, seconds: number) {
    for (let i = 0; i < seconds * 4; i++) {
      this.t += 250;
      runner.tick();
    }
  }
}

const imgs = (n: number) => Array.from({ length: n }, (_, i) => `img_${i}.png`);
const setup = (patch: Partial<SetupConfig>): SetupConfig => ({ ...DEFAULT_SETUP, ...patch });
const seeded = () => {
  let x = 42;
  return () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296);
};

describe('shuffle', () => {
  it('keeps every item exactly once and does not mutate the input', () => {
    const input = imgs(30);
    const out = shuffle(input, seeded());
    assert.deepEqual([...out].sort(), [...input].sort());
    assert.deepEqual(input, imgs(30));
    assert.notDeepEqual(out, input);
  });
});

describe('per-image mode', () => {
  it('moves on after the per-image time and ends after the planned count', () => {
    const clock = new FakeClock();
    const r = new SessionRunner({ setup: setup({ mode: 'per-image', perImageSec: 30, count: 3 }), images: imgs(10), clock, rng: seeded() });
    assert.equal(r.snapshot().shown, 1);
    assert.equal(r.snapshot().remaining, 30);
    clock.run(r, 29);
    assert.equal(r.snapshot().position, 0);
    clock.run(r, 1.25);
    assert.equal(r.snapshot().position, 1);
    clock.run(r, 30);
    assert.equal(r.snapshot().position, 2);
    clock.run(r, 30);
    const s = r.snapshot();
    assert.equal(s.status, 'complete');
    assert.equal(s.shown, 3);
    assert.equal(Math.round(s.totalElapsed), 90);
  });

  it('never repeats an image within one pass of the folder', () => {
    const clock = new FakeClock();
    const r = new SessionRunner({ setup: setup({ mode: 'per-image', perImageSec: 5, count: 10 }), images: imgs(10), clock, rng: seeded() });
    clock.run(r, 100);
    const seen = r.history();
    assert.equal(seen.length, 10);
    assert.equal(new Set(seen).size, 10);
  });

  it('caps the plan at the number of images in the folder', () => {
    const clock = new FakeClock();
    const r = new SessionRunner({ setup: setup({ mode: 'per-image', perImageSec: 5, count: 50 }), images: imgs(4), clock, rng: seeded() });
    assert.equal(r.snapshot().planned, 4);
    clock.run(r, 60);
    assert.equal(r.snapshot().status, 'complete');
    assert.equal(r.imagesShown(), 4);
  });

  it('open-ended (count 0) reshuffles after the folder is used up', () => {
    const clock = new FakeClock();
    const r = new SessionRunner({ setup: setup({ mode: 'per-image', perImageSec: 5, count: 0 }), images: imgs(3), clock, rng: seeded() });
    clock.run(r, 5 * 7);
    assert.equal(r.snapshot().status, 'running');
    assert.ok(r.imagesShown() >= 7);
    assert.equal(r.snapshot().planned, 0);
  });

  it('does not count time while paused', () => {
    const clock = new FakeClock();
    const r = new SessionRunner({ setup: setup({ mode: 'per-image', perImageSec: 60, count: 5 }), images: imgs(5), clock, rng: seeded() });
    clock.run(r, 10);
    r.pause();
    clock.run(r, 120);
    assert.equal(r.snapshot().status, 'paused');
    assert.equal(Math.round(r.snapshot().totalElapsed), 10);
    r.resume();
    clock.run(r, 5);
    assert.equal(Math.round(r.snapshot().totalElapsed), 15);
    assert.equal(Math.round(r.snapshot().remaining ?? -1), 45);
  });

  it('prev goes back to the same image and next walks forward again without drawing a new one', () => {
    const clock = new FakeClock();
    const r = new SessionRunner({ setup: setup({ mode: 'per-image', perImageSec: 60, count: 5 }), images: imgs(8), clock, rng: seeded() });
    const first = r.snapshot().current;
    r.next();
    const second = r.snapshot().current;
    assert.notEqual(first, second);
    r.prev();
    assert.equal(r.snapshot().current, first);
    r.next();
    assert.equal(r.snapshot().current, second);
    assert.equal(r.imagesShown(), 2);
  });

  it('addTime extends and shortens the current countdown, never below one second', () => {
    const clock = new FakeClock();
    const r = new SessionRunner({ setup: setup({ mode: 'per-image', perImageSec: 60, count: 5 }), images: imgs(5), clock, rng: seeded() });
    r.addTime(15);
    assert.equal(r.snapshot().remaining, 75);
    r.addTime(-500);
    assert.equal(r.snapshot().remaining, 1);
  });

  it('skips forward correctly across a long gap but credits at most maxGapMs of it', () => {
    const clock = new FakeClock();
    const r = new SessionRunner({ setup: setup({ mode: 'per-image', perImageSec: 30, count: 10 }), images: imgs(10), clock, rng: seeded() });
    clock.t += 3_600_000; // the laptop slept for an hour
    r.tick();
    assert.equal(r.snapshot().totalElapsed, 10);
    assert.equal(r.snapshot().position, 0);
  });
});

describe('whole-session mode', () => {
  it('ends when the sitting is over and images advance only on request', () => {
    const clock = new FakeClock();
    const r = new SessionRunner({ setup: setup({ mode: 'whole', totalSec: 60 }), images: imgs(10), clock, rng: seeded() });
    clock.run(r, 40);
    assert.equal(r.snapshot().position, 0);
    r.next();
    assert.equal(r.snapshot().position, 1);
    assert.equal(Math.round(r.snapshot().remaining ?? -1), 20);
    clock.run(r, 30);
    const s = r.snapshot();
    assert.equal(s.status, 'complete');
    assert.equal(s.totalElapsed, 60);
    assert.equal(s.remaining, 0);
  });

  it('addTime moves the end of the sitting', () => {
    const clock = new FakeClock();
    const r = new SessionRunner({ setup: setup({ mode: 'whole', totalSec: 60 }), images: imgs(3), clock, rng: seeded() });
    r.addTime(60);
    clock.run(r, 90);
    assert.equal(r.snapshot().status, 'running');
    clock.run(r, 31);
    assert.equal(r.snapshot().status, 'complete');
  });
});

describe('no-timer mode', () => {
  it('has no countdown, counts elapsed time and only moves on request', () => {
    const clock = new FakeClock();
    const r = new SessionRunner({ setup: setup({ mode: 'none' }), images: imgs(3), clock, rng: seeded() });
    clock.run(r, 600);
    const s = r.snapshot();
    assert.equal(s.remaining, null);
    assert.equal(s.countdownTotal, null);
    assert.equal(s.position, 0);
    assert.equal(Math.round(s.imageElapsed), 600);
    r.next();
    assert.equal(r.snapshot().imageElapsed, 0);
    assert.equal(Math.round(r.snapshot().totalElapsed), 600);
  });
});

describe('finish and edge cases', () => {
  it('finish keeps the time already drawn', () => {
    const clock = new FakeClock();
    const r = new SessionRunner({ setup: setup({ mode: 'per-image', perImageSec: 60, count: 5 }), images: imgs(5), clock, rng: seeded() });
    clock.run(r, 20);
    const s = r.finish();
    assert.equal(s.status, 'complete');
    assert.equal(Math.round(s.totalElapsed), 20);
  });

  it('an empty folder completes immediately', () => {
    const clock = new FakeClock();
    const r = new SessionRunner({ setup: setup({}), images: [], clock });
    assert.equal(r.snapshot().status, 'complete');
    assert.equal(r.snapshot().current, null);
  });
});
