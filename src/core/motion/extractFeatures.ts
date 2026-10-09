import { APP_CONFIG } from '../../app/config';
import { MotionDataError } from '../errors';
import { distance3, lerp3, median, sub3 } from '../math';
import type {
  FeatureFrame,
  FeatureHand,
  HandMode,
  MotionSample,
  RawHandObservation,
  RecognitionTemplate,
  TrackDefinition,
  Vec2,
  Vec3,
} from '../types';
import { imagePointToPixels, palmAxes, palmPixelScale, palmWorldScale } from './coordinates';
import { canInterpolateGap } from './gapPolicy';
import { estimateReliability } from '../tracking/estimateReliability';

interface InterpolatedHand {
  observation: RawHandObservation;
  interpolated: boolean;
  gapMs: number;
}

function interpolateObservation(
  trackId: string,
  timeMs: number,
  sample: MotionSample,
): InterpolatedHand {
  const frames = sample.rawFrames.filter((frame) => frame.tMs >= sample.trim.startMs && frame.tMs <= sample.trim.endMs);
  let before: { tMs: number; hand: RawHandObservation } | null = null;
  let after: { tMs: number; hand: RawHandObservation } | null = null;
  for (const frame of frames) {
    const hand = frame.hands.find((candidate) => candidate.trackId === trackId);
    if (!hand) continue;
    if (frame.tMs <= timeMs) before = { tMs: frame.tMs, hand };
    if (frame.tMs >= timeMs) {
      after = { tMs: frame.tMs, hand };
      break;
    }
  }
  if (!before || !after) throw new MotionDataError('片段端點缺少可靠手部追蹤', 'TRACKING_GAP');
  const gapMs = after.tMs - before.tMs;
  const hasTrackingGap = frames.some((frame) => frame.tMs > before!.tMs && frame.tMs < after!.tMs
    && !frame.hands.some((hand) => hand.trackId === trackId));
  if (hasTrackingGap && !canInterpolateGap(gapMs)) {
    throw new MotionDataError('追蹤缺口超過可插值限制', 'TRACKING_GAP');
  }
  if (before.hand.diagnostics.associationAmbiguous || after.hand.diagnostics.associationAmbiguous) {
    throw new MotionDataError('手部身分配對不確定', 'INVALID_SAMPLE');
  }
  if (before.tMs === after.tMs) return { observation: structuredClone(before.hand), interpolated: false, gapMs: 0 };
  if (!before.hand.worldLandmarks || !after.hand.worldLandmarks) {
    throw new MotionDataError('缺少 world landmarks', 'INVALID_LANDMARKS');
  }
  const amount = (timeMs - before.tMs) / (after.tMs - before.tMs);
  return {
    observation: {
      ...before.hand,
      handednessScore: before.hand.handednessScore === null || after.hand.handednessScore === null
        ? before.hand.handednessScore
        : before.hand.handednessScore + (after.hand.handednessScore - before.hand.handednessScore) * amount,
      imageLandmarks: before.hand.imageLandmarks.map((point, index) => lerp3(point, after!.hand.imageLandmarks[index], amount)),
      worldLandmarks: before.hand.worldLandmarks.map((point, index) => lerp3(point, after!.hand.worldLandmarks![index], amount)),
    },
    interpolated: hasTrackingGap,
    gapMs: hasTrackingGap ? gapMs : 0,
  };
}

function roleOrder(a: TrackDefinition, b: TrackDefinition): number {
  return a.role === b.role ? 0 : a.role === 'primary' ? -1 : 1;
}

function flattenLocalPose(points: Vec3[], wrist: Vec3, scale: number): number[] {
  return points.flatMap((point) => {
    const relative = sub3(point, wrist);
    return [relative[0] / scale, relative[1] / scale, relative[2] / scale];
  });
}

function jointAngle(a: Vec3, b: Vec3, c: Vec3): number {
  const ab = sub3(a, b);
  const cb = sub3(c, b);
  const denominator = Math.max(1e-8, distance3(a, b) * distance3(c, b));
  const cosine = Math.max(-1, Math.min(1, (ab[0] * cb[0] + ab[1] * cb[1] + ab[2] * cb[2]) / denominator));
  return Math.acos(cosine) / Math.PI;
}

export function extractShapeFeatures(points: Vec3[], scale: number): number[] {
  const chains = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [0, 9, 10, 11, 12], [0, 13, 14, 15, 16], [0, 17, 18, 19, 20]];
  const flexion = chains.flatMap((chain) => [
    jointAngle(points[chain[0]], points[chain[1]], points[chain[2]]),
    jointAngle(points[chain[1]], points[chain[2]], points[chain[3]]),
    jointAngle(points[chain[2]], points[chain[3]], points[chain[4]]),
  ]);
  const tips = [4, 8, 12, 16, 20];
  const mcps = [1, 5, 9, 13, 17];
  const palmCenter: Vec3 = [
    (points[0][0] + points[5][0] + points[9][0] + points[13][0] + points[17][0]) / 5,
    (points[0][1] + points[5][1] + points[9][1] + points[13][1] + points[17][1]) / 5,
    (points[0][2] + points[5][2] + points[9][2] + points[13][2] + points[17][2]) / 5,
  ];
  const tipToMcp = tips.map((tip, index) => distance3(points[tip], points[mcps[index]]) / scale);
  const tipToPalm = tips.map((tip) => distance3(points[tip], palmCenter) / scale);
  const thumbIndexPinch = distance3(points[4], points[8]) / scale;
  const openness = tipToPalm.reduce((sum, value) => sum + value, 0) / tipToPalm.length;
  return [...flexion, ...tipToMcp, ...tipToPalm, thumbIndexPinch, openness];
}

export function extractFeatureFrames(sample: MotionSample, frameCount = APP_CONFIG.recognitionFrames): FeatureFrame[] {
  if (sample.tracks.length < 1 || sample.tracks.length > 2) {
    throw new MotionDataError('只支援一手或雙手片段', 'INCOMPATIBLE_MODE');
  }
  const duration = sample.trim.endMs - sample.trim.startMs;
  if (duration < APP_CONFIG.minDurationMs || duration > APP_CONFIG.maxDurationMs) {
    throw new MotionDataError('片段時長不在 0.5–8 秒範圍', 'INVALID_SAMPLE');
  }
  const tracks = [...sample.tracks].sort(roleOrder);
  const validObservations = sample.rawFrames
    .filter((frame) => frame.tMs >= sample.trim.startMs && frame.tMs <= sample.trim.endMs)
    .flatMap((frame) => frame.hands.map((hand) => ({ hand, track: tracks.find((track) => track.trackId === hand.trackId) })))
    .filter((item): item is { hand: RawHandObservation; track: TrackDefinition } => Boolean(item.track && item.hand.worldLandmarks));

  const pixelScales = validObservations.map(({ hand }) => palmPixelScale(hand, sample.capture.videoWidth, sample.capture.videoHeight));
  const sharedPixelScale = median(pixelScales);
  const worldScaleByTrack = new Map<string, number>();
  for (const track of tracks) {
    const scales = validObservations.filter((item) => item.track.trackId === track.trackId).map((item) => palmWorldScale(item.hand));
    worldScaleByTrack.set(track.trackId, median(scales));
  }

  const times = Array.from({ length: frameCount }, (_, index) => sample.trim.startMs + duration * index / (frameCount - 1));
  const interpolated = times.map((timeMs) => tracks.map((track) => {
    const result = interpolateObservation(track.trackId, timeMs, sample);
    return { track, hand: result.observation, interpolated: result.interpolated, gapMs: result.gapMs };
  }));
  const firstWrists = interpolated[0].map(({ hand }) => imagePointToPixels(hand.imageLandmarks[0], sample.capture.videoWidth, sample.capture.videoHeight));
  const origin: Vec2 = [
    firstWrists.reduce((sum, wrist) => sum + wrist[0], 0) / firstWrists.length,
    firstWrists.reduce((sum, wrist) => sum + wrist[1], 0) / firstWrists.length,
  ];

  return interpolated.map((handsAtTime, index): FeatureFrame => {
    const hands = handsAtTime.map(({ track, hand, interpolated: wasInterpolated, gapMs }): FeatureHand => {
      if (!hand.worldLandmarks) throw new MotionDataError('缺少 world landmarks', 'INVALID_LANDMARKS');
      const wristPx = imagePointToPixels(hand.imageLandmarks[0], sample.capture.videoWidth, sample.capture.videoHeight);
      const scale = worldScaleByTrack.get(track.trackId)!;
      const reliability = estimateReliability(hand, wasInterpolated ? 'interpolated' : 'model-estimate', gapMs);
      return {
        role: track.role,
        side: track.side,
        localPose: flattenLocalPose(hand.worldLandmarks, hand.worldLandmarks[0], scale),
        shape: extractShapeFeatures(hand.worldLandmarks, scale),
        rootXY: [(wristPx[0] - origin[0]) / sharedPixelScale, (wristPx[1] - origin[1]) / sharedPixelScale],
        palmAxes: palmAxes(hand),
        reliability: {
          localPose: reliability.localPose,
          shape: reliability.shape,
          rootXY: reliability.rootXY,
          palmOrientation: reliability.palmOrientation,
          evidence: reliability.evidence,
        },
      };
    });
    return {
      phase: index / (frameCount - 1),
      hands,
      interHandXY: hands.length === 2
        ? [hands[1].rootXY[0] - hands[0].rootXY[0], hands[1].rootXY[1] - hands[0].rootXY[1]]
        : null,
    };
  });
}

export function buildRecognitionTemplate(sample: MotionSample): RecognitionTemplate {
  const mode: HandMode = sample.tracks.length === 2 ? 'dual' : 'single';
  return {
    sampleId: sample.id,
    sampleRevision: sample.revision,
    gestureId: sample.gestureId,
    profileId: sample.profileId,
    mode,
    featureVersion: APP_CONFIG.featureVersion,
    preprocessingVersion: APP_CONFIG.preprocessingVersion,
    frames: extractFeatureFrames(sample),
    durationMs: sample.trim.endMs - sample.trim.startMs,
    derivedFrom: 'raw-motion',
    motionType: sample.motionType ?? 'dynamic',
  };
}
