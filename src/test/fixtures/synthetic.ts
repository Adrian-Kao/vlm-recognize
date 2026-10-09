import type { HandMode, MotionSample, RawHandObservation, RawMotionFrame, TrackerDetection, Vec3 } from '../../core/types';
import { createMotionSample } from '../../core/motion/createMotionSample';

const OPEN_HAND_WORLD: Vec3[] = [
  [0, 0, 0], [-0.34, 0.15, -0.04], [-0.5, 0.38, -0.06], [-0.62, 0.58, -0.04], [-0.7, 0.76, 0],
  [-0.28, 0.5, 0], [-0.3, 0.83, -0.02], [-0.3, 1.1, -0.01], [-0.3, 1.34, 0],
  [0, 0.57, 0], [0, 0.94, -0.02], [0, 1.25, -0.01], [0, 1.52, 0],
  [0.27, 0.52, 0], [0.3, 0.86, -0.02], [0.32, 1.13, -0.01], [0.34, 1.36, 0],
  [0.5, 0.38, 0], [0.58, 0.66, -0.01], [0.63, 0.88, 0], [0.68, 1.07, 0],
];

function syntheticDetection(timestampMs: number, side: 'Left' | 'Right' = 'Right', centerX = 0.5, phaseOffset = 0): TrackerDetection {
  const phase = ((timestampMs / 1800) % 1 + phaseOffset) % 1;
  const rootX = centerX + 0.14 * Math.sin(phase * Math.PI * 2);
  const flex = 0.1 + 0.1 * Math.sin(phase * Math.PI * 2);
  const worldLandmarks = OPEN_HAND_WORLD.map((point, index): Vec3 => {
    const fingerJoint = index > 4 ? index % 4 : 0;
    const x = side === 'Left' ? -point[0] : point[0];
    return [x, point[1] - flex * fingerJoint, point[2] + flex * fingerJoint * 0.35];
  });
  const imageLandmarks = worldLandmarks.map((point): Vec3 => [
    rootX + point[0] * 0.105,
    0.72 - point[1] * 0.22,
    point[2] * 0.1,
  ]);
  return { side, handednessScore: 0.99, imageLandmarks, worldLandmarks };
}

export function makeSyntheticDetections(timestampMs: number, dual = false): TrackerDetection[] {
  const primary = syntheticDetection(timestampMs, 'Right', dual ? 0.42 : 0.5);
  if (!dual) return [primary];
  const secondary = syntheticDetection(timestampMs, 'Left', 0.58);
  return [primary, secondary];
}

export function normalizeFrames(frames: RawMotionFrame[]): RawMotionFrame[] {
  if (frames.length === 0) return [];
  const start = frames[0].tMs;
  return frames.map((frame) => ({ ...structuredClone(frame), tMs: frame.tMs - start }));
}

export interface SyntheticSampleOptions {
  path?: 'right' | 'left' | 'up' | 'still';
  pose?: 'open-close' | 'close-open' | 'steady';
  durationMs?: number;
  frameCount?: number;
  mode?: HandMode;
}

function makeTestHand(phase: number, path: NonNullable<SyntheticSampleOptions['path']>, pose: NonNullable<SyntheticSampleOptions['pose']>, side: 'Left' | 'Right', trackId: string): RawHandObservation {
  const flex = pose === 'steady' ? 0.1 : pose === 'open-close' ? phase * 0.18 : (1 - phase) * 0.18;
  const worldLandmarks = OPEN_HAND_WORLD.map((point, index): Vec3 => {
    const joint = index > 4 ? index % 4 : 0;
    const x = side === 'Left' && point[0] !== 0 ? -point[0] : point[0];
    return [x, point[1] - flex * joint, point[2] + flex * joint * 0.5];
  });
  let rootX = side === 'Left' ? 0.68 : 0.32;
  let rootY = 0.72;
  if (path === 'right') rootX += phase * 0.28;
  if (path === 'left') rootX -= phase * 0.24;
  if (path === 'up') rootY -= phase * 0.28;
  const imageLandmarks = worldLandmarks.map((point): Vec3 => [rootX + point[0] * 0.08, rootY - point[1] * 0.17, point[2] * 0.1]);
  return {
    trackId,
    side,
    handednessScore: 0.99,
    imageLandmarks,
    worldLandmarks,
    diagnostics: { finite: true, insideFrame: true, geometryValid: true, associationAmbiguous: false },
  };
}

export function makeSyntheticSample(options: SyntheticSampleOptions = {}): MotionSample {
  const path = options.path ?? 'right';
  const pose = options.pose ?? 'steady';
  const durationMs = options.durationMs ?? 1_200;
  const frameCount = options.frameCount ?? 31;
  const mode = options.mode ?? 'single';
  const frames = Array.from({ length: frameCount }, (_, index): RawMotionFrame => {
    const phase = index / (frameCount - 1);
    const hands = [makeTestHand(phase, path, pose, 'Right', 'right-track')];
    if (mode === 'dual') hands.push(makeTestHand(phase, path === 'right' ? 'left' : 'right', pose, 'Left', 'left-track'));
    return { tMs: phase * durationMs, hands };
  });
  return createMotionSample(frames, mode, {
    source: 'synthetic', videoWidth: 640, videoHeight: 480, previewMirrored: false, modelSha256: 'synthetic-fixture',
  });
}
