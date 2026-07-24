import { describe, it, expect } from 'vitest';
import {
  dhashFromRGBA,
  parseHexHash,
  hammingDistance,
  buildHashIndex,
  matchHashIndex,
} from './imageHash';

const ALL_ONES = { hi: 0xffffffff, lo: 0xffffffff };
const ALL_ZEROS = { hi: 0, lo: 0 };

/** Build a WxH RGBA buffer from a per-pixel grayscale function. */
const rgba = (w: number, h: number, gray: (x: number, y: number) => number): Uint8ClampedArray => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const v = gray(x, y);
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
};

describe('dhashFromRGBA', () => {
  it('a left-to-right brightness gradient sets every bit (left < right)', () => {
    const hash = dhashFromRGBA(rgba(90, 80, (x) => Math.floor((x / 89) * 255)), 90, 80);
    expect(hash).toEqual(ALL_ONES);
  });

  it('a uniform image sets no bits', () => {
    const hash = dhashFromRGBA(rgba(90, 80, () => 128), 90, 80);
    expect(hash).toEqual(ALL_ZEROS);
  });

  it('matches the hex encoding the build script would emit (bit order lockstep)', () => {
    // All-ones grid -> 0xffffffffffffffff; the client parse must agree.
    const gradient = dhashFromRGBA(rgba(90, 80, (x) => Math.floor((x / 89) * 255)), 90, 80);
    expect(gradient).toEqual(parseHexHash('ffffffffffffffff'));
    expect(dhashFromRGBA(rgba(90, 80, () => 0), 90, 80)).toEqual(parseHexHash('0000000000000000'));
  });
});

describe('hammingDistance', () => {
  it('is 0 for identical hashes and 64 for opposite hashes', () => {
    expect(hammingDistance(ALL_ONES, ALL_ONES)).toBe(0);
    expect(hammingDistance(ALL_ONES, ALL_ZEROS)).toBe(64);
  });

  it('counts differing bits', () => {
    expect(hammingDistance({ hi: 0b1011, lo: 0 }, { hi: 0b1110, lo: 0 })).toBe(2);
  });
});

describe('matchHashIndex', () => {
  const index = buildHashIndex({
    version: 1,
    algo: 'dhash9x8',
    ids: ['a', 'b'],
    hashes: ['ffffffffffffffff', '0000000000000000'],
  });

  it('returns the nearest card within the distance budget', () => {
    // One bit off the all-ones entry.
    expect(matchHashIndex(index, { hi: 0xfffffffe, lo: 0xffffffff }, 10)).toEqual({ id: 'a', distance: 1 });
  });

  it('returns null when nothing is close enough', () => {
    // Equidistant-ish but beyond budget from both.
    expect(matchHashIndex(index, { hi: 0x0000ffff, lo: 0x0000ffff }, 5)).toBeNull();
  });
});
