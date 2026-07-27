import { describe, expect, it } from 'vitest';
import { matchTopK, type ArtIndex } from './artIndex';

/** Build a tiny int8 index from float rows, mirroring the build-time quantize. */
const makeIndex = (ids: string[], vecs: number[][], scale = 127): ArtIndex => {
  const dim = vecs[0].length;
  const rows = new Int8Array(ids.length * dim);
  vecs.forEach((v, i) => {
    for (let d = 0; d < dim; d++) {
      rows[i * dim + d] = Math.max(-127, Math.min(127, Math.round(v[d] * scale)));
    }
  });
  return { model: 'test', dim, scale, ids, rows };
};

describe('matchTopK', () => {
  it('ranks the nearest row first and scores an identical unit vector ~1', () => {
    const index = makeIndex(
      ['a', 'b', 'c'],
      [
        [1, 0, 0],
        [0, 1, 0],
        [0.6, 0.8, 0],
      ],
    );
    const query = new Float32Array([1, 0, 0]);
    const top = matchTopK(query, index, 3);

    expect(top.map((m) => m.id)).toEqual(['a', 'c', 'b']);
    expect(top[0].score).toBeCloseTo(1, 5);
    expect(top[1].score).toBeCloseTo(0.6, 2);
    expect(top[2].score).toBeCloseTo(0, 5);
  });

  it('honours k and returns fewer rows than requested when the index is small', () => {
    const index = makeIndex(['a', 'b'], [[1, 0], [0, 1]]);
    expect(matchTopK(new Float32Array([1, 0]), index, 5)).toHaveLength(2);
    expect(matchTopK(new Float32Array([1, 0]), index, 1)).toEqual([
      expect.objectContaining({ id: 'a' }),
    ]);
  });
});
