import { APP_CONFIG } from '../../app/config';
import { distance2, mse } from '../math';
import type { RawMotionFrame } from '../types';

export type SegmenterState = 'NO_HAND' | 'READY' | 'MOVING' | 'END_PENDING' | 'CLASSIFYING' | 'COOLDOWN';

export type SegmenterEvent =
  | { type: 'state'; state: SegmenterState }
  | { type: 'segment'; segmentId: string; frames: RawMotionFrame[] }
  | { type: 'invalid'; reason: string };

function motionEnergy(previous: RawMotionFrame, current: RawMotionFrame): number {
  if (previous.hands.length !== current.hands.length || current.hands.length === 0) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (const hand of current.hands) {
    const old = previous.hands.find((candidate) => candidate.trackId === hand.trackId);
    if (!old) return Number.POSITIVE_INFINITY;
    const root = distance2(old.imageLandmarks[0], hand.imageLandmarks[0]) * 30;
    const oldPose = old.imageLandmarks.flatMap((point) => point);
    const pose = hand.imageLandmarks.flatMap((point) => point);
    total += root + Math.sqrt(mse(oldPose, pose)) * 60;
  }
  const dt = Math.max(8, current.tMs - previous.tMs);
  return total / current.hands.length * (33 / dt);
}

export class MotionSegmenter {
  state: SegmenterState = 'NO_HAND';
  private buffer: RawMotionFrame[] = [];
  private segment: RawMotionFrame[] = [];
  private movementSince: number | null = null;
  private stillSince: number | null = null;
  private cooldownSince: number | null = null;
  private emitted = false;

  reset(): void {
    this.state = 'NO_HAND';
    this.buffer = [];
    this.segment = [];
    this.movementSince = null;
    this.stillSince = null;
    this.cooldownSince = null;
    this.emitted = false;
  }

  push(frame: RawMotionFrame): SegmenterEvent[] {
    const events: SegmenterEvent[] = [];
    const previous = this.buffer.at(-1);
    this.buffer.push(structuredClone(frame));
    this.buffer = this.buffer.filter((item) => frame.tMs - item.tMs <= APP_CONFIG.segmenter.preRollMs);
    const hasReliableHand = frame.hands.length > 0 && frame.hands.every((hand) => !hand.diagnostics.associationAmbiguous);
    if (!hasReliableHand) {
      if (this.state === 'MOVING' || this.state === 'END_PENDING') events.push({ type: 'invalid', reason: '動作中追蹤中斷或手部身分不確定' });
      this.state = 'NO_HAND';
      this.segment = [];
      this.movementSince = null;
      this.stillSince = null;
      events.push({ type: 'state', state: this.state });
      return events;
    }
    if (this.state === 'NO_HAND') {
      this.state = 'READY';
      events.push({ type: 'state', state: this.state });
      return events;
    }
    const energy = previous ? motionEnergy(previous, frame) : 0;

    if (this.state === 'READY') {
      if (energy >= APP_CONFIG.segmenter.startThreshold) {
        this.movementSince ??= frame.tMs;
        if (frame.tMs - this.movementSince >= APP_CONFIG.segmenter.startHoldMs) {
          this.state = 'MOVING';
          this.segment = this.buffer.map((item) => structuredClone(item));
          this.emitted = false;
          events.push({ type: 'state', state: this.state });
        }
      } else {
        this.movementSince = null;
      }
    } else if (this.state === 'MOVING' || this.state === 'END_PENDING') {
      this.segment.push(structuredClone(frame));
      if (frame.tMs - this.segment[0].tMs > APP_CONFIG.maxDurationMs) {
        events.push({ type: 'invalid', reason: '自動片段超過 8 秒上限' });
        this.state = 'COOLDOWN';
        this.cooldownSince = frame.tMs;
        events.push({ type: 'state', state: this.state });
      } else if (energy <= APP_CONFIG.segmenter.stopThreshold) {
        this.stillSince ??= frame.tMs;
        if (this.state !== 'END_PENDING') {
          this.state = 'END_PENDING';
          events.push({ type: 'state', state: this.state });
        }
        if (frame.tMs - this.stillSince >= APP_CONFIG.segmenter.endHoldMs && !this.emitted) {
          this.state = 'CLASSIFYING';
          this.emitted = true;
          const end = this.stillSince;
          const selected = this.segment.filter((item) => item.tMs <= end);
          events.push({ type: 'state', state: this.state });
          events.push({ type: 'segment', segmentId: crypto.randomUUID(), frames: selected });
          this.state = 'COOLDOWN';
          this.cooldownSince = frame.tMs;
          events.push({ type: 'state', state: this.state });
        }
      } else {
        this.stillSince = null;
        if (this.state === 'END_PENDING') {
          this.state = 'MOVING';
          events.push({ type: 'state', state: this.state });
        }
      }
    } else if (this.state === 'COOLDOWN') {
      if (energy <= APP_CONFIG.segmenter.stopThreshold && frame.tMs - (this.cooldownSince ?? frame.tMs) >= APP_CONFIG.segmenter.cooldownMs) {
        this.state = 'READY';
        this.segment = [];
        this.movementSince = null;
        this.stillSince = null;
        this.emitted = false;
        events.push({ type: 'state', state: this.state });
      }
    }
    return events;
  }
}
