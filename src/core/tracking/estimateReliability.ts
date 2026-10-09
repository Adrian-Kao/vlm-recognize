import { distance3 } from '../math';
import type { FeatureReliability, PoseEvidence, RawHandObservation } from '../types';

const FINGER_CHAINS = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
] as const;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export interface ReliabilityEstimate extends FeatureReliability {
  palm: number;
  fingers: number[];
}

export function estimateReliability(
  hand: RawHandObservation,
  evidence: PoseEvidence = 'model-estimate',
  gapMs = 0,
): ReliabilityEstimate {
  if (!hand.diagnostics.finite || hand.imageLandmarks.length !== 21 || hand.worldLandmarks?.length !== 21) {
    return { localPose: 0, shape: 0, rootXY: 0, palmOrientation: 0, palm: 0, fingers: [0, 0, 0, 0, 0], evidence: 'missing' };
  }
  const points = hand.worldLandmarks;
  const palmScale = (distance3(points[0], points[9]) + distance3(points[5], points[17])) / 2;
  const geometry = hand.diagnostics.geometryValid && Number.isFinite(palmScale) && palmScale > 1e-6 ? 1 : 0;
  const inside = hand.diagnostics.insideFrame ? 1 : 0.62;
  const identity = hand.diagnostics.associationAmbiguous ? 0 : 1;
  const evidenceFactor = evidence === 'model-estimate' ? 1 : evidence === 'interpolated' ? Math.max(0.45, 0.78 - gapMs / 500) : evidence === 'predicted' ? 0.35 : 0;
  const palm = geometry * inside * identity * evidenceFactor;
  const fingers = FINGER_CHAINS.map((chain) => {
    const lengths = [distance3(points[chain[0]], points[chain[1]]), distance3(points[chain[1]], points[chain[2]]), distance3(points[chain[2]], points[chain[3]])];
    const plausible = lengths.every((length) => Number.isFinite(length) && length > palmScale * 0.025 && length < palmScale * 1.25);
    const ratio = Math.max(...lengths) / Math.max(1e-8, Math.min(...lengths));
    return plausible ? palm * clamp01(1.6 - ratio / 3.5) : 0;
  });
  const fingerMean = fingers.reduce((sum, value) => sum + value, 0) / fingers.length;
  return {
    localPose: clamp01(0.55 * palm + 0.45 * fingerMean),
    shape: fingerMean,
    rootXY: palm,
    palmOrientation: palm,
    palm,
    fingers,
    evidence,
  };
}

