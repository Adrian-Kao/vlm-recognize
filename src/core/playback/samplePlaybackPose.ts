import { lerp3 } from '../math';
import type { PlaybackClip, PlaybackPose } from '../types';

export function samplePlaybackPose(clip: PlaybackClip, inputTimeMs: number): PlaybackPose {
  const timeMs = Math.max(0, Math.min(clip.durationMs, inputTimeMs));
  if (timeMs <= clip.poses[0].tMs) return structuredClone(clip.poses[0]);
  if (timeMs >= clip.poses.at(-1)!.tMs) return structuredClone(clip.poses.at(-1)!);
  let rightIndex = clip.poses.findIndex((pose) => pose.tMs >= timeMs);
  if (rightIndex < 1) rightIndex = 1;
  const left = clip.poses[rightIndex - 1];
  const right = clip.poses[rightIndex];
  const amount = (timeMs - left.tMs) / Math.max(1e-8, right.tMs - left.tMs);
  return {
    tMs: timeMs,
    hands: left.hands.map((hand) => {
      const other = right.hands.find((candidate) => candidate.trackId === hand.trackId) ?? hand;
      return { ...hand, joints: hand.joints.map((point, index) => lerp3(point, other.joints[index], amount)) };
    }),
  };
}

export function advancePlaybackTime(
  currentMs: number,
  elapsedRealMs: number,
  speed: number,
  durationMs: number,
  loop: boolean,
): { timeMs: number; ended: boolean } {
  const next = currentMs + elapsedRealMs * speed;
  if (durationMs <= 0) return { timeMs: 0, ended: true };
  if (next < durationMs) return { timeMs: Math.max(0, next), ended: false };
  return loop ? { timeMs: next % durationMs, ended: false } : { timeMs: durationMs, ended: true };
}
