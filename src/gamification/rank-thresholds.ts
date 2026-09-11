// Level (1-indexed) -> minimum tasks completed in a calendar month to reach it.
// Mirrors the draft ladder in the spec: easy to retune later.
export const RANK_THRESHOLDS = [0, 5, 15, 30, 50, 80, 120, 170, 230, 300];

export function levelForCount(count: number): number {
  let level = 1;
  for (let i = 0; i < RANK_THRESHOLDS.length; i++) {
    if (count >= RANK_THRESHOLDS[i]) {
      level = i + 1;
    }
  }
  return level;
}
