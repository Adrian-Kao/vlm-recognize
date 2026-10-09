import { APP_CONFIG } from '../../app/config';
import { MotionDataError } from '../errors';
import { mse } from '../math';
import type { FeatureFrame, FeatureHand } from '../types';

function compatibleHand(a: FeatureHand, b: FeatureHand): boolean {
  return a.role === b.role && a.side === b.side;
}

export function featureFrameCost(a: FeatureFrame, b: FeatureFrame): number {
  if (a.hands.length !== b.hands.length) return Number.POSITIVE_INFINITY;
  const handsA = [...a.hands].sort((left, right) => left.role.localeCompare(right.role));
  const handsB = [...b.hands].sort((left, right) => left.role.localeCompare(right.role));
  if (!handsA.every((hand, index) => compatibleHand(hand, handsB[index]))) return Number.POSITIVE_INFINITY;

  const pose = handsA.reduce((sum, hand, index) => sum + mse(hand.localPose, handsB[index].localPose), 0) / handsA.length;
  const root = handsA.reduce((sum, hand, index) => sum + mse(hand.rootXY, handsB[index].rootXY), 0) / handsA.length;
  const axes = handsA.reduce((sum, hand, index) => sum + mse(hand.palmAxes, handsB[index].palmAxes), 0) / handsA.length;
  if (handsA.length === 1) return 0.5 * pose + 0.35 * root + 0.15 * axes;
  if (!a.interHandXY || !b.interHandXY) return Number.POSITIVE_INFINITY;
  return 0.4 * pose + 0.25 * root + 0.15 * axes + 0.2 * mse(a.interHandXY, b.interHandXY);
}

interface Cell { cost: number; length: number }

export function dtwDistance(
  a: FeatureFrame[],
  b: FeatureFrame[],
  bandRatio = APP_CONFIG.dtwBandRatio,
): number {
  if (a.length === 0 || b.length === 0) throw new MotionDataError('DTW 不接受空序列', 'INVALID_SAMPLE');
  const radius = Math.max(Math.abs(a.length - b.length), Math.ceil(Math.max(a.length, b.length) * bandRatio));
  const table: Cell[][] = Array.from({ length: a.length }, () => Array.from({ length: b.length }, () => ({ cost: Number.POSITIVE_INFINITY, length: 0 })));
  for (let i = 0; i < a.length; i += 1) {
    const start = Math.max(0, i - radius);
    const end = Math.min(b.length - 1, i + radius);
    for (let j = start; j <= end; j += 1) {
      const local = featureFrameCost(a[i], b[j]);
      if (!Number.isFinite(local)) continue;
      if (i === 0 && j === 0) {
        table[i][j] = { cost: local, length: 1 };
        continue;
      }
      const predecessors: Cell[] = [];
      if (i > 0 && j > 0) predecessors.push(table[i - 1][j - 1]);
      if (i > 0) predecessors.push(table[i - 1][j]);
      if (j > 0) predecessors.push(table[i][j - 1]);
      const best = predecessors.reduce<Cell | null>((current, candidate) => {
        if (!Number.isFinite(candidate.cost)) return current;
        if (!current || candidate.cost < current.cost) return candidate;
        return current;
      }, null);
      if (best) table[i][j] = { cost: local + best.cost, length: best.length + 1 };
    }
  }
  const final = table[a.length - 1][b.length - 1];
  if (!Number.isFinite(final.cost) || final.length === 0) throw new MotionDataError('DTW 路徑不可達', 'INVALID_SAMPLE');
  return Math.sqrt(final.cost / final.length);
}
