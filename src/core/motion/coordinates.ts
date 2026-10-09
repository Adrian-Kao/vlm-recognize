import { MotionDataError } from '../errors';
import { cross3, distance2, distance3, EPSILON, normalize3, sub3 } from '../math';
import type { RawHandObservation, Vec2, Vec3 } from '../types';

export function imagePointToPixels(point: Vec3, width: number, height: number): Vec2 {
  return [point[0] * width, point[1] * height];
}

export function palmPixelScale(hand: RawHandObservation, width: number, height: number): number {
  const wrist = imagePointToPixels(hand.imageLandmarks[0], width, height);
  const middleMcp = imagePointToPixels(hand.imageLandmarks[9], width, height);
  const indexMcp = imagePointToPixels(hand.imageLandmarks[5], width, height);
  const pinkyMcp = imagePointToPixels(hand.imageLandmarks[17], width, height);
  const scale = (distance2(wrist, middleMcp) + distance2(indexMcp, pinkyMcp)) / 2;
  if (!Number.isFinite(scale) || scale < EPSILON) throw new MotionDataError('掌部影像尺度退化', 'ZERO_SCALE');
  return scale;
}

export function palmWorldScale(hand: RawHandObservation): number {
  if (!hand.worldLandmarks) throw new MotionDataError('缺少 world landmarks，無法建立立體手形', 'INVALID_LANDMARKS');
  const scale = (distance3(hand.worldLandmarks[0], hand.worldLandmarks[9])
    + distance3(hand.worldLandmarks[5], hand.worldLandmarks[17])) / 2;
  if (!Number.isFinite(scale) || scale < EPSILON) throw new MotionDataError('掌部 world 尺度退化', 'ZERO_SCALE');
  return scale;
}

export function palmAxes(hand: RawHandObservation): number[] {
  const points = hand.worldLandmarks;
  if (!points) throw new MotionDataError('缺少 world landmarks，無法取得手掌方向', 'INVALID_LANDMARKS');
  try {
    const forward = normalize3(sub3(points[9], points[0]));
    const acrossRaw = normalize3(sub3(points[5], points[17]));
    const normal = normalize3(cross3(acrossRaw, forward));
    const across = normalize3(cross3(forward, normal));
    return [...forward, ...across];
  } catch {
    throw new MotionDataError('手掌方向基底退化', 'ZERO_SCALE');
  }
}

export function providerToSceneLocal(point: Vec3): Vec3 {
  return [point[0], -point[1], -point[2]];
}
