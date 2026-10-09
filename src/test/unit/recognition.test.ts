import { describe, expect, it } from 'vitest';
import { buildRecognitionTemplate } from '../../core/motion/extractFeatures';
import { dtwDistance } from '../../core/recognition/dtw';
import { classifySample } from '../../core/recognition/classify';
import { makeSyntheticSample } from '../fixtures/synthetic';
import type { GestureRecord, RecognitionTemplate } from '../../core/types';

function gesture(id: string, name: string): GestureRecord {
  const now = new Date().toISOString();
  return { id, profileId: 'local-default', name, nameKey: name.toLowerCase(), aliases: [], mode: 'single', handednessPolicy: 'match-recording', representativeSampleId: null, revision: 1, createdAt: now, updatedAt: now };
}

function template(id: string, gestureId: string, options: Parameters<typeof makeSyntheticSample>[0]): RecognitionTemplate {
  const sample = { ...makeSyntheticSample(options), id, gestureId };
  return buildRecognitionTemplate(sample);
}

describe('多變量 DTW 與拒絕式分類', () => {
  it('相同序列距離為零，時間重新採樣後仍接近', () => {
    const normal = template('a', 'right', { path: 'right', pose: 'open-close', frameCount: 31, durationMs: 1_200 });
    const fastSample = { ...makeSyntheticSample({ path: 'right', pose: 'open-close', frameCount: 17, durationMs: 700 }), gestureId: 'right' };
    const fast = buildRecognitionTemplate(fastSample);
    expect(dtwDistance(normal.frames, normal.frames)).toBeCloseTo(0, 8);
    expect(dtwDistance(normal.frames, fast.frames)).toBeLessThan(0.025);
  });

  it('保留向左與向右的根節點移動方向', () => {
    const right = template('right-sample', 'right', { path: 'right' });
    const rightAgain = template('right-again', 'right', { path: 'right', durationMs: 900, frameCount: 24 });
    const left = template('left-sample', 'left', { path: 'left' });
    expect(dtwDistance(right.frames, rightAgain.frames)).toBeLessThan(dtwDistance(right.frames, left.frames));
    expect(dtwDistance(right.frames, left.frames)).toBeGreaterThan(0.2);
  });

  it('保留先張開再握拳與相反順序', () => {
    const openClose = template('oc', 'oc', { path: 'still', pose: 'open-close' });
    const closeOpen = template('co', 'co', { path: 'still', pose: 'close-open' });
    expect(dtwDistance(openClose.frames, closeOpen.frames)).toBeGreaterThan(0.12);
  });

  it('單一類別的遠距查詢會 Unknown，而不是永遠命中', () => {
    const stored = template('right-sample', 'right', { path: 'right', pose: 'steady' });
    const query = makeSyntheticSample({ path: 'up', pose: 'close-open' });
    const result = classifySample(query, { gestures: [gesture('right', '向右')], templates: [stored], calibrations: [], memoryRevision: 1 }, 'segment-1');
    expect(result.status).toBe('unknown');
    expect(result.distance).toBeGreaterThan(0.35);
  });

  it('兩個不同類別使用相同模板時回報 Ambiguous，候選不重複類別', () => {
    const a = template('sample-a', 'a', { path: 'right' });
    const b = { ...a, sampleId: 'sample-b', gestureId: 'b' };
    const query = makeSyntheticSample({ path: 'right' });
    const result = classifySample(query, { gestures: [gesture('a', '甲'), gesture('b', '乙')], templates: [a, b], calibrations: [], memoryRevision: 2 }, 'segment-2');
    expect(result.status).toBe('ambiguous');
    expect(result.candidates.map((candidate) => candidate.gestureId)).toEqual(['a', 'b']);
  });

  it('單手查詢不會匹配雙手模板', () => {
    const dual = template('dual', 'dual-gesture', { path: 'right', mode: 'dual' });
    const query = makeSyntheticSample({ path: 'right', mode: 'single' });
    const result = classifySample(query, { gestures: [], templates: [dual], calibrations: [], memoryRevision: 1 }, 'segment-3');
    expect(result.status).toBe('unknown');
  });

  it('鏡像預覽旗標不改變儲存座標或辨識特徵', () => {
    const original = makeSyntheticSample({ path: 'right', pose: 'open-close' });
    const mirroredPreview = { ...structuredClone(original), capture: { ...original.capture, previewMirrored: true } };
    expect(mirroredPreview.rawFrames).toEqual(original.rawFrames);
    expect(buildRecognitionTemplate(mirroredPreview).frames).toEqual(buildRecognitionTemplate(original).frames);
  });

  it('缺少 21 點與長追蹤缺口會拒絕，不產生假距離', () => {
    const malformed = makeSyntheticSample();
    malformed.rawFrames[5].hands[0].worldLandmarks = malformed.rawFrames[5].hands[0].worldLandmarks!.slice(0, 20);
    expect(() => buildRecognitionTemplate(malformed)).toThrow();

    const longGap = makeSyntheticSample({ frameCount: 31, durationMs: 1_200 });
    for (let index = 10; index <= 16; index += 1) longGap.rawFrames[index].hands = [];
    expect(() => buildRecognitionTemplate(longGap)).toThrow(/缺口/);
  });
});
