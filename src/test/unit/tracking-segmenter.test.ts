import { describe, expect, it } from 'vitest';
import { HandAssociator } from '../../core/tracking/associateHands';
import { MotionSegmenter } from '../../core/motion/segmenter';
import { makeSyntheticDetections, makeSyntheticSample } from '../fixtures/synthetic';
import type { RawMotionFrame } from '../../core/types';

describe('跨幀手部 association', () => {
  it('兩手輸出陣列交換後仍保留原 track', () => {
    const associator = new HandAssociator();
    const first = associator.update(makeSyntheticDetections(100, true), 100);
    const second = associator.update(makeSyntheticDetections(133, true).reverse(), 133);
    const firstBySide = Object.fromEntries(first.map((hand) => [hand.side, hand.trackId]));
    const secondBySide = Object.fromEntries(second.map((hand) => [hand.side, hand.trackId]));
    expect(secondBySide.Left).toBe(firstBySide.Left);
    expect(secondBySide.Right).toBe(firstBySide.Right);
  });
});

describe('自動切段狀態機', () => {
  it('一個動作只產生一個 final segment，冷卻時不重複觸發', () => {
    const base = makeSyntheticSample({ path: 'still', frameCount: 40, durationMs: 1_560 }).rawFrames[0].hands[0];
    const frames: RawMotionFrame[] = [];
    let xOffset = 0;
    for (let index = 0; index < 50; index += 1) {
      if (index >= 6 && index < 13) xOffset += 0.04;
      const movingHand = structuredClone(base);
      movingHand.imageLandmarks = movingHand.imageLandmarks.map(([x, y, z]) => [x + xOffset, y, z]);
      frames.push({ tMs: index * 40, hands: [movingHand] });
    }
    const segmenter = new MotionSegmenter();
    const events = frames.flatMap((frame) => segmenter.push(frame));
    expect(events.filter((event) => event.type === 'segment')).toHaveLength(1);
  });

  it('無手與靜止手不會觸發片段', () => {
    const segmenter = new MotionSegmenter();
    const sample = makeSyntheticSample({ path: 'still', pose: 'steady', frameCount: 35, durationMs: 1_400 });
    const events = [{ tMs: 0, hands: [] }, ...sample.rawFrames.map((frame) => ({ ...frame, tMs: frame.tMs + 40 }))]
      .flatMap((frame) => segmenter.push(frame));
    expect(events.some((event) => event.type === 'segment')).toBe(false);
  });

  it('手腕不動、只改變手指形狀也能觸發 motion start', () => {
    const segmenter = new MotionSegmenter();
    const steady = makeSyntheticSample({ path: 'still', pose: 'open-close', frameCount: 16, durationMs: 600 });
    const first = steady.rawFrames[0].hands[0];
    const last = steady.rawFrames.at(-1)!.hands[0];
    const frames: RawMotionFrame[] = [];
    for (let index = 0; index < 6; index += 1) frames.push({ tMs: index * 40, hands: [structuredClone(first)] });
    for (let index = 1; index < steady.rawFrames.length; index += 1) frames.push({ tMs: (index + 5) * 40, hands: structuredClone(steady.rawFrames[index].hands) });
    for (let index = 0; index < 18; index += 1) frames.push({ tMs: (index + 21) * 40, hands: [structuredClone(last)] });
    const events = frames.flatMap((frame) => segmenter.push(frame));
    expect(events.some((event) => event.type === 'segment')).toBe(true);
  });
});
