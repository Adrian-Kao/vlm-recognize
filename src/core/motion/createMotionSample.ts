import { APP_CONFIG, MEDIAPIPE_ASSETS } from '../../app/config';
import type { CaptureMetadata, HandMode, MotionSample, RawMotionFrame, TrackDefinition } from '../types';
import { assessMotionQuality } from './quality';

export interface CaptureContext {
  source: CaptureMetadata['source'];
  videoWidth: number;
  videoHeight: number;
  previewMirrored: boolean;
  modelSha256: string;
}

export function createMotionSample(
  inputFrames: RawMotionFrame[],
  mode: HandMode,
  capture: CaptureContext,
): MotionSample {
  if (inputFrames.length < 2) throw new Error('沒有足夠影格可建立動作片段');
  const start = inputFrames[0].tMs;
  const rawFrames = inputFrames.map((frame) => ({ ...structuredClone(frame), tMs: frame.tMs - start }));
  const counts = new Map<string, { count: number; side: TrackDefinition['side'] }>();
  for (const frame of rawFrames) {
    for (const hand of frame.hands) {
      const current = counts.get(hand.trackId) ?? { count: 0, side: hand.side };
      current.count += 1;
      current.side = hand.side;
      counts.set(hand.trackId, current);
    }
  }
  const expected = mode === 'dual' ? 2 : 1;
  const tracks: TrackDefinition[] = [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, expected)
    .map(([trackId, value], index) => ({ trackId, side: value.side, role: index === 0 ? 'primary' : 'secondary' }));
  if (tracks.length !== expected) throw new Error(mode === 'dual' ? '雙手模式沒有持續追蹤到兩手' : '沒有追蹤到手');
  const allowed = new Set(tracks.map((track) => track.trackId));
  const selectedFrames = rawFrames.map((frame) => ({ ...frame, hands: frame.hands.filter((hand) => allowed.has(hand.trackId)) }));
  const endMs = selectedFrames.at(-1)!.tMs;
  const quality = assessMotionQuality(selectedFrames, mode);
  return {
    id: crypto.randomUUID(),
    gestureId: '',
    profileId: APP_CONFIG.profileId,
    schemaVersion: 1,
    revision: 1,
    capture: {
      source: capture.source,
      videoWidth: capture.videoWidth,
      videoHeight: capture.videoHeight,
      inferenceInputMirrored: false,
      previewMirrored: capture.previewMirrored,
      provider: 'mediapipe-hand-landmarker',
      packageVersion: MEDIAPIPE_ASSETS.packageVersion,
      modelSha256: capture.modelSha256,
      capturedAt: new Date().toISOString(),
    },
    tracks,
    rawFrames: selectedFrames,
    trim: { startMs: 0, endMs },
    quality,
    createdAt: new Date().toISOString(),
  };
}
