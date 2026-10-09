import { APP_CONFIG } from '../../app/config';
import { MotionDataError } from '../errors';
import { median, sub3 } from '../math';
import type { MotionSample, PlaybackClip, PlaybackHandPose, Vec2 } from '../types';
import { imagePointToPixels, palmPixelScale, palmWorldScale, providerToSceneLocal } from '../motion/coordinates';

const SCENE_SCALE = 1.25;

export function buildPlaybackClip(sample: MotionSample): PlaybackClip {
  const frames = sample.rawFrames.filter((frame) => frame.tMs >= sample.trim.startMs && frame.tMs <= sample.trim.endMs);
  const usable = frames.filter((frame) => sample.tracks.every((track) => {
    const hand = frame.hands.find((candidate) => candidate.trackId === track.trackId);
    return hand?.worldLandmarks?.length === 21 && hand.imageLandmarks.length === 21 && !hand.diagnostics.associationAmbiguous;
  }));
  if (usable.length < 2) throw new MotionDataError('沒有足夠的立體追蹤影格可供重播', 'INVALID_SAMPLE');
  let maxGap = 0;
  for (let index = 1; index < usable.length; index += 1) maxGap = Math.max(maxGap, usable[index].tMs - usable[index - 1].tMs);
  if (maxGap > APP_CONFIG.trackingLostGapMs) throw new MotionDataError('追蹤缺口過長，拒絕補造重播動畫', 'TRACKING_GAP');

  const observations = usable.flatMap((frame) => frame.hands.filter((hand) => sample.tracks.some((track) => track.trackId === hand.trackId)));
  const sharedWorldScale = median(observations.map(palmWorldScale));
  const sharedPixelScale = median(observations.map((hand) => palmPixelScale(hand, sample.capture.videoWidth, sample.capture.videoHeight)));
  const first = usable[0];
  const originWrists = sample.tracks.map((track) => {
    const hand = first.hands.find((candidate) => candidate.trackId === track.trackId)!;
    return imagePointToPixels(hand.imageLandmarks[0], sample.capture.videoWidth, sample.capture.videoHeight);
  });
  const origin: Vec2 = [
    originWrists.reduce((sum, wrist) => sum + wrist[0], 0) / originWrists.length,
    originWrists.reduce((sum, wrist) => sum + wrist[1], 0) / originWrists.length,
  ];
  const trajectoryByTrack: Record<string, [number, number, number][]> = {};
  const poses = usable.map((frame) => ({
    tMs: frame.tMs - sample.trim.startMs,
    hands: sample.tracks.map((track): PlaybackHandPose => {
      const hand = frame.hands.find((candidate) => candidate.trackId === track.trackId)!;
      const world = hand.worldLandmarks!;
      const wristPx = imagePointToPixels(hand.imageLandmarks[0], sample.capture.videoWidth, sample.capture.videoHeight);
      const root: [number, number, number] = [
        (wristPx[0] - origin[0]) / sharedPixelScale,
        -(wristPx[1] - origin[1]) / sharedPixelScale,
        0,
      ];
      const joints = world.map((point) => {
        const local = providerToSceneLocal(sub3(point, world[0]));
        return [
          SCENE_SCALE * (root[0] + local[0] / sharedWorldScale),
          SCENE_SCALE * (root[1] + local[1] / sharedWorldScale),
          SCENE_SCALE * (local[2] / sharedWorldScale),
        ] as [number, number, number];
      });
      (trajectoryByTrack[track.trackId] ??= []).push(joints[0]);
      return { trackId: track.trackId, side: track.side, role: track.role, joints };
    }),
  }));

  return {
    sampleId: sample.id,
    durationMs: sample.trim.endMs - sample.trim.startMs,
    startMs: sample.trim.startMs,
    poses,
    trajectoryByTrack,
    warnings: maxGap > APP_CONFIG.maxInterpolationGapMs ? ['重播包含可見追蹤間隔，未跨長缺口補點'] : [],
  };
}
