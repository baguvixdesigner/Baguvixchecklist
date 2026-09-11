import { levelForCount, RANK_THRESHOLDS } from './rank-thresholds';

describe('levelForCount', () => {
  it('returns level 1 for zero tasks', () => {
    expect(levelForCount(0)).toBe(1);
  });

  it('stays on the current level right below the next threshold', () => {
    expect(levelForCount(4)).toBe(1);
    expect(levelForCount(14)).toBe(2);
    expect(levelForCount(299)).toBe(9);
  });

  it('advances exactly on the threshold value', () => {
    expect(levelForCount(5)).toBe(2);
    expect(levelForCount(15)).toBe(3);
    expect(levelForCount(300)).toBe(10);
  });

  it('caps at the top level for counts far beyond the last threshold', () => {
    expect(levelForCount(10_000)).toBe(RANK_THRESHOLDS.length);
  });

  it('never returns a level outside the ladder', () => {
    for (const count of [0, 1, 5, 50, 500, 5000]) {
      const level = levelForCount(count);
      expect(level).toBeGreaterThanOrEqual(1);
      expect(level).toBeLessThanOrEqual(RANK_THRESHOLDS.length);
    }
  });
});
