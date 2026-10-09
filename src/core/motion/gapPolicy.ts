import { APP_CONFIG } from '../../app/config';

export const GAP_POLICY = {
  version: APP_CONFIG.qualityPolicyVersion,
  interpolationMaxMs: APP_CONFIG.maxInterpolationGapMs,
  trackingLostMs: APP_CONFIG.trackingLostGapMs,
} as const;

export type GapClass = 'none' | 'short-interpolatable' | 'tracking-pending' | 'lost';

export function classifyGap(durationMs: number): GapClass {
  if (durationMs <= 0) return 'none';
  if (durationMs <= GAP_POLICY.interpolationMaxMs) return 'short-interpolatable';
  if (durationMs <= GAP_POLICY.trackingLostMs) return 'tracking-pending';
  return 'lost';
}

export function canInterpolateGap(durationMs: number): boolean {
  const kind = classifyGap(durationMs);
  return kind === 'none' || kind === 'short-interpolatable';
}
