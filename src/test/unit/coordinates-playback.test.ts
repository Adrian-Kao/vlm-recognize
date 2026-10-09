import { describe, expect, it } from 'vitest';
import { imagePointToPixels, providerToSceneLocal } from '../../core/motion/coordinates';
import { buildPlaybackClip } from '../../core/playback/buildPlaybackClip';
import { advancePlaybackTime, samplePlaybackPose } from '../../core/playback/samplePlaybackPose';
import { makeSyntheticSample } from '../fixtures/synthetic';

describe('座標與播放時間', () => {
  it('非正方形影像使用各自寬高換算像素', () => {
    expect(imagePointToPixels([0.5, 0.5, 0], 800, 400)).toEqual([400, 200]);
  });

  it('provider 到場景的固定基底轉換不冒充全域深度', () => {
    expect(providerToSceneLocal([1, 2, 3])).toEqual([1, -2, -3]);
  });

  it('第一、中間、最後姿態可直接取樣，且根節點位移進入 3D', () => {
    const clip = buildPlaybackClip(makeSyntheticSample({ path: 'right' }));
    const first = samplePlaybackPose(clip, 0);
    const middle = samplePlaybackPose(clip, clip.durationMs / 2);
    const last = samplePlaybackPose(clip, clip.durationMs);
    expect(first.tMs).toBe(0);
    expect(middle.hands[0].joints[0][0]).toBeGreaterThan(first.hands[0].joints[0][0]);
    expect(last.hands[0].joints[0][0]).toBeGreaterThan(middle.hands[0].joints[0][0]);
  });

  it('播放速度由單調時間推進；0.5x 需要兩倍真實時間', () => {
    expect(advancePlaybackTime(0, 1_000, 1, 1_000, false)).toEqual({ timeMs: 1_000, ended: true });
    expect(advancePlaybackTime(0, 1_000, 0.5, 1_000, false)).toEqual({ timeMs: 500, ended: false });
    expect(advancePlaybackTime(900, 200, 1, 1_000, true)).toEqual({ timeMs: 100, ended: false });
  });

  it('雙手沿同一時間軸同步取樣', () => {
    const clip = buildPlaybackClip(makeSyntheticSample({ mode: 'dual' }));
    expect(samplePlaybackPose(clip, 600).hands).toHaveLength(2);
    expect(clip.trajectoryByTrack['right-track']).toHaveLength(31);
    expect(clip.trajectoryByTrack['left-track']).toHaveLength(31);
  });
});
