import { APP_CONFIG } from '../../app/config';
import type { HandMode, MotionQuality, RawMotionFrame } from '../types';
import { GAP_POLICY, classifyGap } from './gapPolicy';
import { estimateReliability } from '../tracking/estimateReliability';

export function assessMotionQuality(frames: RawMotionFrame[], mode: HandMode): MotionQuality {
  const warnings: string[] = [];
  const expectedHands = mode === 'dual' ? 2 : 1;
  const duration = Math.max(0, (frames.at(-1)?.tMs ?? 0) - (frames[0]?.tMs ?? 0));
  let validTime = 0;
  let maxGapMs = 0;
  let currentGapStart: number | null = null;
  let observedFrameCount = 0;
  let associationAmbiguous = false;
  let palmScore = 0;
  let fingerScore = 0;
  let evaluatedHands = 0;
  let shortGapCount = 0;

  const isValid = (frame: RawMotionFrame) => frame.hands.length === expectedHands
    && frame.hands.every((hand) => hand.diagnostics.finite
      && hand.diagnostics.insideFrame
      && hand.diagnostics.geometryValid
      && !hand.diagnostics.associationAmbiguous
      && hand.imageLandmarks.length === 21
      && hand.worldLandmarks?.length === 21);

  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    associationAmbiguous ||= frame.hands.some((hand) => hand.diagnostics.associationAmbiguous);
    for (const hand of frame.hands) {
      const reliability = estimateReliability(hand);
      palmScore += reliability.palm;
      fingerScore += reliability.fingers.reduce((sum, value) => sum + value, 0) / reliability.fingers.length;
      evaluatedHands += 1;
    }
    if (isValid(frame)) observedFrameCount += 1;
    if (index === 0) continue;
    const dt = frame.tMs - frames[index - 1].tMs;
    if (isValid(frames[index - 1]) && isValid(frame)) {
      validTime += dt;
      if (currentGapStart !== null) {
        const gap = frames[index - 1].tMs - currentGapStart;
        maxGapMs = Math.max(maxGapMs, gap);
        if (classifyGap(gap) === 'short-interpolatable') shortGapCount += 1;
        currentGapStart = null;
      }
    } else if (currentGapStart === null) {
      currentGapStart = frames[index - 1].tMs;
    }
  }
  if (currentGapStart !== null && frames.length > 0) {
    maxGapMs = Math.max(maxGapMs, frames.at(-1)!.tMs - currentGapStart);
  }

  const validTimeRatio = duration > 0 ? Math.min(1, validTime / duration) : 0;
  if (duration < APP_CONFIG.minDurationMs) warnings.push(`片段少於 ${APP_CONFIG.minDurationMs / 1000} 秒`);
  if (duration > APP_CONFIG.maxDurationMs) warnings.push(`片段超過 ${APP_CONFIG.maxDurationMs / 1000} 秒`);
  if (observedFrameCount < APP_CONFIG.minObservedFrames) warnings.push('有效觀測影格不足');
  if (validTimeRatio < APP_CONFIG.minValidTimeRatio) warnings.push('有效追蹤時間比例不足 90%');
  if (maxGapMs > APP_CONFIG.trackingLostGapMs) warnings.push('追蹤中斷時間過長');
  if (associationAmbiguous) warnings.push('手部身分配對不確定');
  if (mode === 'dual' && frames.some((frame) => frame.hands.length !== 2)) warnings.push('雙手模式需要兩手持續清楚可見');
  const palmCoverage = evaluatedHands ? palmScore / evaluatedHands : 0;
  const fingerCoverage = evaluatedHands ? fingerScore / evaluatedHands : 0;
  const featureCoverage = 0.55 * palmCoverage + 0.45 * fingerCoverage;
  if (palmCoverage < 0.72) warnings.push('掌部追蹤可靠性不足');
  if (featureCoverage < 0.58) warnings.push('可辨識特徵覆蓋不足');
  const status = observedFrameCount === 0 ? 'no-hand'
    : associationAmbiguous || maxGapMs > GAP_POLICY.trackingLostMs ? 'unstable-pose'
      : featureCoverage < 0.58 || validTimeRatio < APP_CONFIG.minValidTimeRatio ? 'low-coverage' : 'ok';
  const observedFps = duration > 0 ? observedFrameCount / (duration / 1000) : 0;
  return { validTimeRatio, maxGapMs, observedFrameCount, associationAmbiguous, warnings, diagnostics: {
    status, durationMs: duration, observedFps, palmCoverage, fingerCoverage, featureCoverage, shortGapCount,
    qualityPolicyVersion: APP_CONFIG.qualityPolicyVersion,
  } };
}

export function isQualityAcceptable(quality: MotionQuality): boolean {
  return quality.observedFrameCount >= APP_CONFIG.minObservedFrames
    && quality.validTimeRatio >= APP_CONFIG.minValidTimeRatio
    && quality.maxGapMs <= APP_CONFIG.trackingLostGapMs
    && !quality.associationAmbiguous
    && (quality.diagnostics?.palmCoverage ?? 1) >= 0.72
    && (quality.diagnostics?.featureCoverage ?? 1) >= 0.58;
}
