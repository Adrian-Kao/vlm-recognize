import { APP_CONFIG } from '../../app/config';
import { buildRecognitionTemplate } from '../motion/extractFeatures';
import { isQualityAcceptable } from '../motion/quality';
import type { CalibrationRecord, GestureRecord, MotionSample, RecognitionResult, RecognitionTemplate } from '../types';
import { dtwDistance } from './dtw';

export interface ClassificationMemory {
  gestures: GestureRecord[];
  templates: RecognitionTemplate[];
  calibrations: CalibrationRecord[];
  memoryRevision: number;
}

export function classifySample(
  query: MotionSample,
  memory: ClassificationMemory,
  segmentId: string = crypto.randomUUID(),
): RecognitionResult {
  const invalid = (reason: string): RecognitionResult => ({
    segmentId,
    status: 'invalid',
    gestureId: null,
    matchedSampleId: null,
    distance: null,
    classMargin: null,
    calibrationStatus: 'uncalibrated',
    candidates: [],
    reason,
    memoryRevision: memory.memoryRevision,
  });
  if (!isQualityAcceptable(query.quality)) return invalid(query.quality.warnings.join('；') || '片段品質不足');

  let queryTemplate: RecognitionTemplate;
  try {
    queryTemplate = buildRecognitionTemplate(query);
  } catch (error) {
    return invalid(error instanceof Error ? error.message : '無法建立辨識特徵');
  }

  const compatible = memory.templates.filter((template) => template.mode === queryTemplate.mode
    && (template.motionType ?? 'dynamic') === (queryTemplate.motionType ?? 'dynamic')
    && template.featureVersion === APP_CONFIG.featureVersion
    && template.preprocessingVersion === APP_CONFIG.preprocessingVersion
    && template.frames[0]?.hands.every((hand, index) => hand.side === queryTemplate.frames[0]?.hands[index]?.side));
  if (compatible.length === 0) {
    return { ...invalid('記憶庫中沒有手數與左右手相容的樣本'), status: 'unknown' };
  }

  const byGesture = new Map<string, { distance: number; sampleId: string }>();
  for (const template of compatible) {
    let distance: number;
    try {
      distance = dtwDistance(queryTemplate.frames, template.frames);
    } catch {
      continue;
    }
    const current = byGesture.get(template.gestureId);
    if (!current || distance < current.distance) byGesture.set(template.gestureId, { distance, sampleId: template.sampleId });
  }
  const ranked = [...byGesture.entries()]
    .map(([gestureId, value]) => ({ gestureId, ...value }))
    .sort((a, b) => a.distance - b.distance);
  if (ranked.length === 0) return { ...invalid('所有時序樣本都無法完成比對'), status: 'unknown' };

  const best = ranked[0];
  const second = ranked[1];
  const calibration = memory.calibrations.find((item) => item.gestureId === best.gestureId);
  const activeCalibration = calibration?.status !== 'stale'
    && calibration?.featureVersion === APP_CONFIG.featureVersion
    && calibration?.preprocessingVersion === APP_CONFIG.preprocessingVersion ? calibration : null;
  const maxDistance = activeCalibration?.maxDistance ?? APP_CONFIG.defaultMaxDistance;
  const minMargin = activeCalibration?.minClassMargin ?? APP_CONFIG.defaultMinClassMargin;
  const margin = second ? (second.distance - best.distance) / Math.max(second.distance, 1e-8) : null;
  const base = {
    segmentId,
    gestureId: best.gestureId,
    matchedSampleId: best.sampleId,
    distance: best.distance,
    classMargin: margin,
    calibrationStatus: calibration?.status ?? 'uncalibrated' as const,
    candidates: ranked.slice(0, 3).map(({ gestureId, distance }) => ({ gestureId, distance })),
    memoryRevision: memory.memoryRevision,
  };
  if (best.distance > maxDistance) {
    return { ...base, status: 'unknown', gestureId: null, matchedSampleId: null, reason: '這個動作尚未記錄，或與現有動作不夠接近。' };
  }
  if (second && (margin === null || margin < minMargin)) {
    return { ...base, status: 'ambiguous', gestureId: null, matchedSampleId: null, reason: '前兩個候選差異不足，請重新示範或增加更有區別的樣本。' };
  }
  const gestureExists = memory.gestures.some((gesture) => gesture.id === best.gestureId);
  if (!gestureExists) return { ...invalid('匹配的動作已從記憶庫移除'), status: 'unknown' };
  return { ...base, status: 'recognized', reason: '已依完整時序找到最接近的個人動作。' };
}
