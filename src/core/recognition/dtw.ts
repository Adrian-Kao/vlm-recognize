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

  const weights = handsA.length === 1
    ? { pose: 0.50, shape: 0.10, root: 0.29, axes: 0.11, inter: 0 }
    : { pose: 0.28, shape: 0.18, root: 0.22, axes: 0.12, inter: 0.20 };
  let weightedError = 0;
  let commonWeight = 0;
  let informativeWeight = 0;
  const hasDerivedGap = handsA.some((hand, index) => hand.reliability.evidence !== 'model-estimate'
    || handsB[index].reliability.evidence !== 'model-estimate');
  const add = (error: number, weight: number, reliabilityA: number, reliabilityB: number, informative = true) => {
    if (!Number.isFinite(error)) return;
    const effective = weight * reliabilityA * reliabilityB;
    weightedError += effective * error;
    commonWeight += effective;
    if (informative) informativeWeight += effective;
  };
  for (let index = 0; index < handsA.length; index += 1) {
    const left = handsA[index];
    const right = handsB[index];
    const divisor = handsA.length;
    add(mse(left.localPose, right.localPose), weights.pose / divisor, left.reliability.localPose, right.reliability.localPose);
    add(mse(left.shape, right.shape), weights.shape / divisor, left.reliability.shape, right.reliability.shape);
    add(mse(left.rootXY, right.rootXY), weights.root / divisor, left.reliability.rootXY, right.reliability.rootXY, false);
    add(mse(left.palmAxes, right.palmAxes), weights.axes / divisor, left.reliability.palmOrientation, right.reliability.palmOrientation);
  }
  if (handsA.length === 1) {
    if (commonWeight < APP_CONFIG.minCommonFeatureWeight || informativeWeight < APP_CONFIG.minInformativeFeatureWeight) return Number.POSITIVE_INFINITY;
    return weightedError / commonWeight + (hasDerivedGap ? (1 - commonWeight) * APP_CONFIG.missingFeaturePenalty : 0);
  }
  if (!a.interHandXY || !b.interHandXY) return Number.POSITIVE_INFINITY;
  const interReliabilityA = Math.min(...handsA.map((hand) => hand.reliability.rootXY));
  const interReliabilityB = Math.min(...handsB.map((hand) => hand.reliability.rootXY));
  add(mse(a.interHandXY, b.interHandXY), weights.inter, interReliabilityA, interReliabilityB);
  if (commonWeight < APP_CONFIG.minCommonFeatureWeight || informativeWeight < APP_CONFIG.minInformativeFeatureWeight) return Number.POSITIVE_INFINITY;
  return weightedError / commonWeight + (hasDerivedGap ? (1 - commonWeight) * APP_CONFIG.missingFeaturePenalty : 0);
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
