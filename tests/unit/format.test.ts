import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clock, fmtMin, fmtSec, parseDuration } from '../../src/shared/format';

describe('format', () => {
  it('fmtMin', () => {
    assert.equal(fmtMin(0), '0m');
    assert.equal(fmtMin(59), '59m');
    assert.equal(fmtMin(113), '1h 53m');
  });
  it('fmtSec', () => {
    assert.equal(fmtSec(30), '30 sec');
    assert.equal(fmtSec(120), '2 min');
    assert.equal(fmtSec(90), '1 min 30 sec');
    assert.equal(fmtSec(3600), '1 h');
    assert.equal(fmtSec(5400), '1 h 30 min');
  });
  it('clock', () => {
    assert.equal(clock(0), '0:00');
    assert.equal(clock(83), '1:23');
    assert.equal(clock(3700), '1:01:40');
    assert.equal(clock(-5), '0:00');
  });
  it('parseDuration: bare number is minutes, mm:ss and h:mm:ss are literal', () => {
    assert.equal(parseDuration('5'), 300);
    assert.equal(parseDuration('1:30'), 90);
    assert.equal(parseDuration('1:02:03'), 3723);
    assert.equal(parseDuration('abc'), null);
    assert.equal(parseDuration('0'), null);
    assert.equal(parseDuration(''), null);
  });
});
