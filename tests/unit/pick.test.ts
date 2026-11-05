import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { imagesToDraw } from '../../src/shared/pick';

const ALL = ['a.png', 'b.png', 'poses/c.png', 'd.png'];

describe('imagesToDraw', () => {
  it('no choice means the whole folder', () => {
    assert.deepEqual(imagesToDraw(ALL, undefined), ALL);
    assert.deepEqual(imagesToDraw(ALL, []), ALL);
  });
  it('keeps only the chosen images, in folder order', () => {
    assert.deepEqual(imagesToDraw(ALL, ['d.png', 'a.png']), ['a.png', 'd.png']);
  });
  it('drops chosen images that left the folder', () => {
    assert.deepEqual(imagesToDraw(ALL, ['b.png', 'gone.png']), ['b.png']);
  });
  it('returns nothing when none of the chosen images are left', () => {
    assert.deepEqual(imagesToDraw(ALL, ['gone.png']), []);
  });
  it('returns a copy, never the caller\'s array', () => {
    const out = imagesToDraw(ALL, undefined);
    out.pop();
    assert.equal(ALL.length, 4);
  });
});
