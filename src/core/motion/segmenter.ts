import { APP_CONFIG } from '../../app/config';
import { distance2, mse } from '../math';
import type { GestureMotionType, RawMotionFrame } from '../types';
import { classifyGap } from './gapPolicy';

export type SegmenterState = 'NO_HAND' | 'READY' | 'MOVING' | 'HOLDING' | 'END_PENDING' | 'TRACKING_PENDING' | 'CLASSIFYING' | 'COOLDOWN';

export type SegmenterEvent =
  | { type: 'state'; state: SegmenterState }
  | { type: 'segment'; segmentId: string; frames: RawMotionFrame[] }
  | { type: 'invalid'; reason: string; diagnostic: 'no-hand' | 'unstable-pose' | 'segment-not-triggered' | 'low-coverage' };

export function motionEnergy(previous: RawMotionFrame, current: RawMotionFrame): number {
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

function reliable(frame: RawMotionFrame): boolean {
  return frame.hands.length > 0 && frame.hands.every((hand) => hand.diagnostics.finite
    && hand.diagnostics.geometryValid && !hand.diagnostics.associationAmbiguous);
}

export class MotionSegmenter {
  state: SegmenterState = 'NO_HAND';
  private buffer: RawMotionFrame[] = [];
  private segment: RawMotionFrame[] = [];
  private movementSince: number | null = null;
  private stillSince: number | null = null;
  private cooldownSince: number | null = null;
  private emitted = false;
  private motionType: GestureMotionType;
  private gapSince: number | null = null;
  private stateBeforeGap: SegmenterState = 'NO_HAND';
  private lastReliable: RawMotionFrame | null = null;

  constructor(motionType: GestureMotionType = 'dynamic') {
    this.motionType = motionType;
  }

  setMotionType(motionType: GestureMotionType): void {
    if (motionType !== this.motionType) {
      this.motionType = motionType;
      this.reset();
    }
  }

  reset(): void {
    this.state = 'NO_HAND';
    this.buffer = [];
    this.segment = [];
    this.movementSince = null;
    this.stillSince = null;
    this.cooldownSince = null;
    this.emitted = false;
    this.gapSince = null;
    this.stateBeforeGap = 'NO_HAND';
    this.lastReliable = null;
  }

  private transition(state: SegmenterState, events: SegmenterEvent[]): void {
    if (this.state === state) return;
    this.state = state;
    events.push({ type: 'state', state });
  }

  private invalidate(reason: string, events: SegmenterEvent[]): void {
    events.push({ type: 'invalid', reason, diagnostic: 'unstable-pose' });
    this.segment = [];
    this.movementSince = null;
    this.stillSince = null;
    this.emitted = false;
    this.gapSince = null;
    this.lastReliable = null;
    this.transition('NO_HAND', events);
  }

  private handleGap(frame: RawMotionFrame, events: SegmenterEvent[]): boolean {
    if (reliable(frame)) return false;
    this.gapSince ??= this.lastReliable?.tMs ?? frame.tMs;
    if (this.state !== 'TRACKING_PENDING') {
      this.stateBeforeGap = this.state;
      this.transition('TRACKING_PENDING', events);
    }
    if (this.segment.length) this.segment.push(structuredClone(frame));
    const gapMs = frame.tMs - this.gapSince;
    if (classifyGap(gapMs) === 'lost') {
      this.invalidate('追蹤中斷超過共用缺口上限，未猜測遮擋期間的動作', events);
    }
    return true;
  }

  private resumeFromGap(frame: RawMotionFrame, events: SegmenterEvent[]): boolean {
    if (this.gapSince === null) return true;
    const gapMs = frame.tMs - this.gapSince;
    const gapClass = classifyGap(gapMs);
    if (gapClass !== 'short-interpolatable') {
      this.invalidate('追蹤缺口超過 150ms 可插值上限，片段拒絕辨識', events);
      return false;
    }
    if (this.stillSince !== null) this.stillSince += gapMs;
    this.gapSince = null;
    this.transition(this.stateBeforeGap === 'NO_HAND' ? 'READY' : this.stateBeforeGap, events);
    return true;
  }

  private pushStatic(frame: RawMotionFrame, previous: RawMotionFrame | null, events: SegmenterEvent[]): void {
    const energy = previous ? motionEnergy(previous, frame) : 0;
    if (this.state === 'READY' || this.state === 'HOLDING') {
      if (energy <= APP_CONFIG.segmenter.stopThreshold) {
        this.stillSince ??= previous?.tMs ?? frame.tMs;
        this.segment.push(structuredClone(frame));
        this.transition('HOLDING', events);
        if (frame.tMs - this.stillSince >= APP_CONFIG.segmenter.staticHoldMs && !this.emitted) {
          this.emitted = true;
          this.transition('CLASSIFYING', events);
          const start = frame.tMs - APP_CONFIG.segmenter.staticHoldMs;
          const selected = this.segment.filter((item) => item.tMs >= start);
          events.push({ type: 'segment', segmentId: crypto.randomUUID(), frames: selected });
          this.cooldownSince = frame.tMs;
          this.transition('COOLDOWN', events);
        }
      } else {
        this.segment = [structuredClone(frame)];
        this.stillSince = frame.tMs;
        this.transition('READY', events);
      }
      return;
    }
    if (this.state === 'COOLDOWN' && energy >= APP_CONFIG.segmenter.staticReleaseThreshold) {
      this.segment = [structuredClone(frame)];
      this.stillSince = frame.tMs;
      this.emitted = false;
      this.transition('READY', events);
    }
  }

  private pushDynamic(frame: RawMotionFrame, previous: RawMotionFrame | null, events: SegmenterEvent[]): void {
    const energy = previous ? motionEnergy(previous, frame) : 0;
    if (this.state === 'READY') {
      if (energy >= APP_CONFIG.segmenter.startThreshold) {
        this.movementSince ??= frame.tMs;
        if (frame.tMs - this.movementSince >= APP_CONFIG.segmenter.startHoldMs) {
          this.segment = this.buffer.map((item) => structuredClone(item));
          this.emitted = false;
          this.transition('MOVING', events);
        }
      } else this.movementSince = null;
      return;
    }
    if (this.state === 'MOVING' || this.state === 'END_PENDING') {
      this.segment.push(structuredClone(frame));
      if (frame.tMs - this.segment[0].tMs > APP_CONFIG.maxDurationMs) {
        events.push({ type: 'invalid', reason: '自動片段超過 8 秒上限', diagnostic: 'segment-not-triggered' });
        this.cooldownSince = frame.tMs;
        this.transition('COOLDOWN', events);
      } else if (energy <= APP_CONFIG.segmenter.stopThreshold) {
        this.stillSince ??= frame.tMs;
        this.transition('END_PENDING', events);
        if (frame.tMs - this.stillSince >= APP_CONFIG.segmenter.endHoldMs && !this.emitted) {
          this.emitted = true;
          this.transition('CLASSIFYING', events);
          const selected = this.segment.filter((item) => item.tMs <= this.stillSince!);
          events.push({ type: 'segment', segmentId: crypto.randomUUID(), frames: selected });
          this.cooldownSince = frame.tMs;
          this.transition('COOLDOWN', events);
        }
      } else {
        this.stillSince = null;
        this.transition('MOVING', events);
      }
      return;
    }
    if (this.state === 'COOLDOWN' && energy <= APP_CONFIG.segmenter.stopThreshold
      && frame.tMs - (this.cooldownSince ?? frame.tMs) >= APP_CONFIG.segmenter.cooldownMs) {
      this.segment = [];
      this.movementSince = null;
      this.stillSince = null;
      this.emitted = false;
      this.transition('READY', events);
    }
  }

  push(frame: RawMotionFrame): SegmenterEvent[] {
    const events: SegmenterEvent[] = [];
    this.buffer.push(structuredClone(frame));
    this.buffer = this.buffer.filter((item) => frame.tMs - item.tMs <= APP_CONFIG.segmenter.preRollMs);
    if (this.handleGap(frame, events)) return events;
    if (!this.resumeFromGap(frame, events)) return events;
    const previous = this.lastReliable;
    this.lastReliable = structuredClone(frame);
    if (this.state === 'NO_HAND' || this.state === 'TRACKING_PENDING') {
      this.segment = [structuredClone(frame)];
      this.stillSince = frame.tMs;
      this.transition('READY', events);
      return events;
    }
    if (this.motionType === 'static-hold') this.pushStatic(frame, previous, events);
    else this.pushDynamic(frame, previous, events);
    return events;
  }
}
