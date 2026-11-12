import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { migrateLegacyData } from '../../src/main/migrate';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'hatchmark-migrate-'));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const seed = (dir: string, text: string) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'sessions.jsonl'), text);
};

describe('migrateLegacyData', () => {
  it('copies the old folder when the new one does not exist', () => {
    const old = path.join(tmp, 'old');
    const next = path.join(tmp, 'new');
    seed(old, 'a');
    assert.equal(migrateLegacyData(old, next), true);
    assert.equal(readFileSync(path.join(next, 'sessions.jsonl'), 'utf8'), 'a');
    assert.ok(existsSync(path.join(old, 'sessions.jsonl')), 'old folder is kept');
  });

  it('copies into an empty new folder', () => {
    const old = path.join(tmp, 'old');
    const next = path.join(tmp, 'new');
    seed(old, 'a');
    mkdirSync(next);
    assert.equal(migrateLegacyData(old, next), true);
  });

  it('never overwrites a new folder that has files', () => {
    const old = path.join(tmp, 'old');
    const next = path.join(tmp, 'new');
    seed(old, 'old');
    seed(next, 'new');
    assert.equal(migrateLegacyData(old, next), false);
    assert.equal(readFileSync(path.join(next, 'sessions.jsonl'), 'utf8'), 'new');
  });

  it('does nothing when there is no old folder', () => {
    assert.equal(migrateLegacyData(path.join(tmp, 'missing'), path.join(tmp, 'new')), false);
    assert.ok(!existsSync(path.join(tmp, 'new')));
  });
});
