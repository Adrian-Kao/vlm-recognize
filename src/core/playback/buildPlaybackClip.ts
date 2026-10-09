import { MotionDataError } from '../errors';
import { distance3, median, normalize3, scale3, add3, sub3 } from '../math';
import type { MotionSample, PlaybackClip, PlaybackHandPose, Vec2 } from '../types';
import { imagePointToPixels, palmPixelScale, palmWorldScale, providerToSceneLocal } from '../motion/coordinates';
import { HAND_BONES } from './handTopology';
import { GAP_POLICY, classifyGap } from '../motion/gapPolicy';

const SCENE_SCALE = 1.25;

export function buildPlaybackClip(sample: MotionSample): PlaybackClip {
  const frames = sample.rawFrames.filter((frame) => frame.tMs >= sample.trim.startMs && frame.tMs <= sample.trim.endMs);
  const isUsable = (frame: MotionSample['rawFrames'][number]) => sample.tracks.every((track) => {
    const hand = frame.hands.find((candidate) => candidate.trackId === track.trackId);
    return hand?.worldLandmarks?.length === 21 && hand.imageLandmarks.length === 21 && !hand.diagnostics.associationAmbiguous;
  });
  const usable = frames.filter(isUsable);
  if (usable.length < 2) throw new MotionDataError('沒有足夠的立體追蹤影格可供重播', 'INVALID_SAMPLE');
  let maxGap = 0;
  const gapRanges: Array<{ startMs: number; endMs: number; interpolated: boolean }> = [];
  for (let index = 1; index < usable.length; index += 1) {
    const start = usable[index - 1].tMs;
    const end = usable[index].tMs;
    const hasMissingEvidence = frames.some((frame) => frame.tMs > start && frame.tMs < end && !isUsable(frame));
    if (!hasMissingEvidence) continue;
    const gap = end - start;
    maxGap = Math.max(maxGap, gap);
    const kind = classifyGap(gap);
    if (kind === 'lost') throw new MotionDataError('追蹤缺口過長，拒絕補造重播動畫', 'TRACKING_GAP');
    gapRanges.push({ startMs: start - sample.trim.startMs, endMs: end - sample.trim.startMs, interpolated: gap <= GAP_POLICY.interpolationMaxMs });
  }

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
  const rawPoses = usable.map((frame) => ({
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

  const stableLengths = new Map<string, number[]>();
  for (const track of sample.tracks) {
    stableLengths.set(track.trackId, HAND_BONES.map(([start, end]) => median(rawPoses.map((pose) => {
      const hand = pose.hands.find((candidate) => candidate.trackId === track.trackId)!;
      return distance3(hand.joints[start], hand.joints[end]);
    }))));
  }
  const poses = rawPoses.map((pose) => ({
    ...pose,
    hands: pose.hands.map((hand) => {
      const fitted = hand.joints.map((point) => [...point] as [number, number, number]);
      HAND_BONES.forEach(([start, end], boneIndex) => {
        const direction = normalize3(sub3(hand.joints[end], hand.joints[start]));
        fitted[end] = add3(fitted[start], scale3(direction, stableLengths.get(hand.trackId)![boneIndex]));
      });
      return { ...hand, fittedJoints: fitted };
    }),
  }));

  return {
    sampleId: sample.id,
    durationMs: sample.trim.endMs - sample.trim.startMs,
    startMs: sample.trim.startMs,
    poses,
    trajectoryByTrack,
    warnings: gapRanges.some((gap) => !gap.interpolated) ? ['重播含 150–250ms 追蹤缺口；顯示會保持上一個姿態，不捏造變化']
      : gapRanges.length ? ['重播包含已標記的短缺口；僅在可靠前後端點間插值'] : [],
    gapRanges,
  };
}
