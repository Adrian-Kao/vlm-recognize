import { z } from 'zod';
import { APP_CONFIG } from '../app/config';

const finiteNumber = z.number().refine(Number.isFinite, '數值必須有限');
const vec3Schema = z.tuple([finiteNumber, finiteNumber, finiteNumber]);
const sideSchema = z.enum(['Left', 'Right', 'Unknown']);

export const rawHandObservationSchema = z.object({
  trackId: z.string().min(1).max(100),
  side: sideSchema,
  handednessScore: finiteNumber.min(0).max(1).nullable(),
  imageLandmarks: z.array(vec3Schema).length(21),
  worldLandmarks: z.array(vec3Schema).length(21).nullable(),
  diagnostics: z.object({
    finite: z.boolean(),
    insideFrame: z.boolean(),
    geometryValid: z.boolean(),
    associationAmbiguous: z.boolean(),
  }),
});

export const rawMotionFrameSchema = z.object({
  tMs: finiteNumber.nonnegative(),
  hands: z.array(rawHandObservationSchema).max(2),
});

export const motionSampleSchema = z.object({
  id: z.string().min(1).max(100),
  gestureId: z.string().max(100),
  profileId: z.string().min(1).max(100),
  schemaVersion: z.literal(1),
  revision: z.number().int().positive(),
  capture: z.object({
    source: z.enum(['camera', 'synthetic']),
    videoWidth: z.number().int().positive().max(16_384),
    videoHeight: z.number().int().positive().max(16_384),
    inferenceInputMirrored: z.literal(false),
    previewMirrored: z.boolean(),
    provider: z.literal('mediapipe-hand-landmarker'),
    packageVersion: z.string().min(1).max(100),
    modelSha256: z.string().max(128),
    capturedAt: z.string().datetime(),
  }),
  tracks: z.array(z.object({
    trackId: z.string().min(1).max(100),
    side: sideSchema,
    role: z.enum(['primary', 'secondary']),
  })).min(1).max(2),
  rawFrames: z.array(rawMotionFrameSchema).min(1).max(APP_CONFIG.import.maxFramesPerSample),
  trim: z.object({ startMs: finiteNumber.nonnegative(), endMs: finiteNumber.nonnegative() }),
  quality: z.object({
    validTimeRatio: finiteNumber.min(0).max(1),
    maxGapMs: finiteNumber.nonnegative(),
    observedFrameCount: z.number().int().nonnegative(),
    associationAmbiguous: z.boolean(),
    warnings: z.array(z.string().max(500)).max(100),
  }),
  createdAt: z.string().datetime(),
}).superRefine((sample, context) => {
  for (let index = 1; index < sample.rawFrames.length; index += 1) {
    if (sample.rawFrames[index].tMs <= sample.rawFrames[index - 1].tMs) {
      context.addIssue({ code: 'custom', path: ['rawFrames', index, 'tMs'], message: '影格時間必須嚴格遞增' });
      break;
    }
  }
  const last = sample.rawFrames.at(-1)?.tMs ?? 0;
  if (sample.trim.endMs <= sample.trim.startMs || sample.trim.endMs > last) {
    context.addIssue({ code: 'custom', path: ['trim'], message: '裁切範圍無效' });
  }
});

export const gestureRecordSchema = z.object({
  id: z.string().min(1).max(100),
  profileId: z.string().min(1).max(100),
  name: z.string().min(1).max(60),
  nameKey: z.string().min(1).max(120),
  aliases: z.array(z.string().min(1).max(60)).max(50),
  mode: z.enum(['single', 'dual']),
  handednessPolicy: z.literal('match-recording'),
  representativeSampleId: z.string().max(100).nullable(),
  revision: z.number().int().positive(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const gestureMemoryExportSchema = z.object({
  manifest: z.object({
    format: z.literal('gesture-memory-studio'),
    schemaVersion: z.literal(1),
    exportedAt: z.string().datetime(),
    featureVersion: z.string().min(1).max(100),
  }),
  gestures: z.array(gestureRecordSchema).max(APP_CONFIG.import.maxGestures),
  samples: z.array(motionSampleSchema).max(APP_CONFIG.import.maxSamples),
  settings: z.record(z.string(), z.unknown()),
}).superRefine((memory, context) => {
  const gestureIds = new Set(memory.gestures.map((gesture) => gesture.id));
  const sampleIds = new Set(memory.samples.map((sample) => sample.id));
  if (gestureIds.size !== memory.gestures.length) context.addIssue({ code: 'custom', path: ['gestures'], message: '動作 ID 不得重複' });
  if (sampleIds.size !== memory.samples.length) context.addIssue({ code: 'custom', path: ['samples'], message: '樣本 ID 不得重複' });
  const nameKeys = new Set<string>();
  for (const [index, gesture] of memory.gestures.entries()) {
    const compound = `${gesture.profileId}\u0000${gesture.nameKey}`;
    if (nameKeys.has(compound)) context.addIssue({ code: 'custom', path: ['gestures', index, 'nameKey'], message: '同一 profile 的名稱不得重複' });
    nameKeys.add(compound);
  }
  for (const [index, sample] of memory.samples.entries()) {
    if (!gestureIds.has(sample.gestureId)) {
      context.addIssue({ code: 'custom', path: ['samples', index, 'gestureId'], message: '樣本指向不存在的動作' });
    }
    const gesture = memory.gestures.find((candidate) => candidate.id === sample.gestureId);
    if (gesture && (sample.profileId !== gesture.profileId || sample.tracks.length !== (gesture.mode === 'dual' ? 2 : 1))) {
      context.addIssue({ code: 'custom', path: ['samples', index], message: '樣本 profile 或手部模式與動作不相容' });
    }
  }
  for (const [index, gesture] of memory.gestures.entries()) {
    const gestureSamples = memory.samples.filter((sample) => sample.gestureId === gesture.id);
    if (gestureSamples.length === 0) {
      context.addIssue({ code: 'custom', path: ['gestures', index], message: '動作至少需要一份樣本' });
    }
    if (gesture.representativeSampleId && !gestureSamples.some((sample) => sample.id === gesture.representativeSampleId)) {
      context.addIssue({ code: 'custom', path: ['gestures', index, 'representativeSampleId'], message: '代表樣本不存在' });
    }
  }
});
