import { APP_CONFIG } from '../../app/config';
import { dtwDistance } from '../recognition/dtw';
import { buildRecognitionTemplate } from '../motion/extractFeatures';
import { isQualityAcceptable } from '../motion/quality';
import type {
  CalibrationRecord,
  GestureLibraryEntry,
  GestureMemoryExport,
  GestureRecord,
  HandMode,
  MotionSample,
  RecognitionTemplate,
} from '../types';
import { GestureDatabase, db as defaultDb } from './db';

const DERIVED_PIPELINE_VERSION = `${APP_CONFIG.featureVersion}|${APP_CONFIG.preprocessingVersion}`;

export function normalizeGestureName(input: string): { name: string; nameKey: string } {
  const name = input.trim().normalize('NFC');
  if (name.length < 1 || name.length > 60) throw new Error('動作名稱必須為 1–60 個字元');
  return { name, nameKey: name.toLocaleLowerCase() };
}

function calibrationFor(gestureId: string, sampleCount: number, memoryRevision: number): CalibrationRecord {
  return {
    gestureId,
    profileId: APP_CONFIG.profileId,
    status: sampleCount >= 3 ? 'provisional' : 'uncalibrated',
    maxDistance: null,
    minClassMargin: null,
    memoryRevision,
    featureVersion: APP_CONFIG.featureVersion,
    preprocessingVersion: APP_CONFIG.preprocessingVersion,
    positiveCount: sampleCount,
    negativeCount: 0,
    evaluatedAt: null,
  };
}

export class GestureRepository {
  private derivedRefresh: Promise<void> | null = null;

  constructor(public readonly database: GestureDatabase = defaultDb) {}

  private ensureCurrentDerivedData(): Promise<void> {
    this.derivedRefresh ??= this.database.transaction('rw', this.database.samples, this.database.templates,
      this.database.calibrations, this.database.metadata, async () => {
        const marker = await this.database.metadata.get('derivedFeatureVersion');
        if (marker?.value === DERIVED_PIPELINE_VERSION) return;
        const samples = await this.database.samples.toArray();
        const rebuilt = samples.map((sample) => buildRecognitionTemplate({ ...sample, motionType: sample.motionType ?? 'dynamic' }));
        await this.database.templates.clear();
        if (rebuilt.length) await this.database.templates.bulkPut(rebuilt);
        await this.database.calibrations.toCollection().modify((calibration) => {
          calibration.status = 'stale';
          calibration.featureVersion = APP_CONFIG.featureVersion;
          calibration.preprocessingVersion = APP_CONFIG.preprocessingVersion;
        });
        await this.database.metadata.put({ key: 'derivedFeatureVersion', value: DERIVED_PIPELINE_VERSION });
      }).catch((error) => {
        this.derivedRefresh = null;
        throw error;
      });
    return this.derivedRefresh;
  }

  async getMemoryRevision(): Promise<number> {
    const record = await this.database.metadata.get('memoryRevision');
    return typeof record?.value === 'number' ? record.value : 0;
  }

  private async incrementMemoryRevision(): Promise<number> {
    const next = await this.getMemoryRevision() + 1;
    await this.database.metadata.put({ key: 'memoryRevision', value: next });
    return next;
  }

  async listLibrary(): Promise<GestureLibraryEntry[]> {
    const gestures = await this.database.gestures.where('profileId').equals(APP_CONFIG.profileId).sortBy('updatedAt');
    return Promise.all(gestures.reverse().map(async (gesture) => ({
      gesture,
      samples: await this.database.samples.where('gestureId').equals(gesture.id).sortBy('createdAt'),
      calibration: await this.database.calibrations.get(gesture.id) ?? null,
    })));
  }

  async saveNamedSample(nameInput: string, mode: HandMode, input: MotionSample): Promise<GestureRecord> {
    const { name, nameKey } = normalizeGestureName(nameInput);
    if (!isQualityAcceptable(input.quality)) throw new Error(`片段品質不足：${input.quality.warnings.join('；')}`);
    if (input.tracks.length !== (mode === 'dual' ? 2 : 1)) throw new Error('錄製片段的手數與選擇模式不符');
    return this.database.transaction('rw', this.database.gestures, this.database.samples, this.database.templates,
      this.database.calibrations, this.database.metadata, async () => {
        const existing = await this.database.gestures.where('[profileId+nameKey]').equals([APP_CONFIG.profileId, nameKey]).first();
        if (existing && existing.mode !== mode) throw new Error('同名動作的單手／雙手模式不相容，請使用不同名稱');
        const motionType = input.motionType ?? 'dynamic';
        if (existing && (existing.motionType ?? 'dynamic') !== motionType) throw new Error('同名動作的動態／靜態保持模式不相容，請使用不同名稱');
        const now = new Date().toISOString();
        const gesture: GestureRecord = existing ?? {
          id: crypto.randomUUID(),
          profileId: APP_CONFIG.profileId,
          name,
          nameKey,
          aliases: [],
          mode,
          handednessPolicy: 'match-recording',
          representativeSampleId: null,
          revision: 1,
          createdAt: now,
          updatedAt: now,
          motionType,
        };
        if (existing) {
          const first = await this.database.samples.where('gestureId').equals(existing.id).first();
          const firstSides = first?.tracks.map((track) => track.side).sort().join(',');
          const nextSides = input.tracks.map((track) => track.side).sort().join(',');
          if (firstSides && firstSides !== nextSides) throw new Error('同名動作的左右手角色不相容，請使用不同名稱');
          gesture.revision += 1;
          gesture.updatedAt = now;
        }
        const sample: MotionSample = {
          ...structuredClone(input),
          id: input.id || crypto.randomUUID(),
          gestureId: gesture.id,
          profileId: APP_CONFIG.profileId,
          motionType,
        };
        const template = buildRecognitionTemplate(sample);
        await this.database.samples.add(sample);
        await this.database.templates.put(template);
        await this.database.gestures.put(gesture);
        const revision = await this.incrementMemoryRevision();
        const sampleCount = await this.database.samples.where('gestureId').equals(gesture.id).count();
        const allCalibrations = await this.database.calibrations.toArray();
        await Promise.all(allCalibrations.map((record) => this.database.calibrations.put({ ...record, status: 'stale', memoryRevision: revision })));
        await this.database.calibrations.put(calibrationFor(gesture.id, sampleCount, revision));
        return gesture;
      });
  }

  async appendSample(gestureId: string, input: MotionSample): Promise<void> {
    const gesture = await this.database.gestures.get(gestureId);
    if (!gesture) throw new Error('找不到要追加的動作');
    await this.saveNamedSample(gesture.name, gesture.mode, { ...input, motionType: gesture.motionType ?? 'dynamic' });
  }

  async renameGesture(gestureId: string, input: string): Promise<void> {
    const { name, nameKey } = normalizeGestureName(input);
    await this.database.transaction('rw', this.database.gestures, this.database.calibrations, this.database.metadata, async () => {
      const gesture = await this.database.gestures.get(gestureId);
      if (!gesture) throw new Error('找不到動作');
      const collision = await this.database.gestures.where('[profileId+nameKey]').equals([gesture.profileId, nameKey]).first();
      if (collision && collision.id !== gestureId) throw new Error('這個名稱已被其他動作使用');
      await this.database.gestures.put({ ...gesture, name, nameKey, revision: gesture.revision + 1, updatedAt: new Date().toISOString() });
      await this.incrementMemoryRevision();
    });
  }

  async deleteSample(sampleId: string): Promise<void> {
    await this.database.transaction('rw', this.database.gestures, this.database.samples, this.database.templates,
      this.database.calibrations, this.database.metadata, async () => {
        const sample = await this.database.samples.get(sampleId);
        if (!sample) return;
        await this.database.samples.delete(sampleId);
        await this.database.templates.delete(sampleId);
        const gesture = await this.database.gestures.get(sample.gestureId);
        if (!gesture) return;
        const remaining = await this.database.samples.where('gestureId').equals(gesture.id).toArray();
        if (remaining.length === 0) {
          await this.database.gestures.delete(gesture.id);
          await this.database.calibrations.delete(gesture.id);
        } else {
          if (gesture.representativeSampleId === sampleId) gesture.representativeSampleId = remaining[0].id;
          gesture.updatedAt = new Date().toISOString();
          gesture.revision += 1;
          await this.database.gestures.put(gesture);
        }
        const revision = await this.incrementMemoryRevision();
        if (remaining.length > 0) await this.database.calibrations.put(calibrationFor(gesture.id, remaining.length, revision));
      });
  }

  async deleteGesture(gestureId: string): Promise<void> {
    await this.database.transaction('rw', this.database.gestures, this.database.samples, this.database.templates,
      this.database.calibrations, this.database.metadata, async () => {
        const sampleIds = (await this.database.samples.where('gestureId').equals(gestureId).primaryKeys()) as string[];
        await this.database.templates.bulkDelete(sampleIds);
        await this.database.samples.where('gestureId').equals(gestureId).delete();
        await this.database.calibrations.delete(gestureId);
        await this.database.gestures.delete(gestureId);
        await this.incrementMemoryRevision();
      });
  }

  async setRepresentative(gestureId: string, sampleId: string): Promise<void> {
    const sample = await this.database.samples.get(sampleId);
    const gesture = await this.database.gestures.get(gestureId);
    if (!sample || !gesture || sample.gestureId !== gestureId) throw new Error('代表樣本與動作不相符');
    await this.database.gestures.put({ ...gesture, representativeSampleId: sampleId, revision: gesture.revision + 1, updatedAt: new Date().toISOString() });
  }

  async getRecognitionMemory() {
    await this.ensureCurrentDerivedData();
    return {
      gestures: await this.database.gestures.where('profileId').equals(APP_CONFIG.profileId).toArray(),
      templates: await this.database.templates.where('profileId').equals(APP_CONFIG.profileId).toArray(),
      calibrations: await this.database.calibrations.where('profileId').equals(APP_CONFIG.profileId).toArray(),
      memoryRevision: await this.getMemoryRevision(),
    };
  }

  async search(queryInput: string): Promise<GestureRecord[]> {
    const query = queryInput.trim().normalize('NFC').toLocaleLowerCase();
    if (!query) return [];
    const all = await this.database.gestures.where('profileId').equals(APP_CONFIG.profileId).toArray();
    return all.filter((gesture) => gesture.nameKey.includes(query)
      || gesture.aliases.some((alias) => alias.toLocaleLowerCase().includes(query)))
      .sort((a, b) => Number(b.nameKey === query) - Number(a.nameKey === query));
  }

  async selectPlaybackSample(gestureId: string): Promise<MotionSample | null> {
    await this.ensureCurrentDerivedData();
    const gesture = await this.database.gestures.get(gestureId);
    const samples = await this.database.samples.where('gestureId').equals(gestureId).toArray();
    const usable = samples.filter((sample) => isQualityAcceptable(sample.quality));
    if (!gesture || usable.length === 0) return null;
    const requested = usable.find((sample) => sample.id === gesture.representativeSampleId);
    if (requested) return requested;
    if (usable.length < 3) return usable[0];
    const templates = (await this.database.templates.where('gestureId').equals(gestureId).toArray())
      .filter((template) => usable.some((sample) => sample.id === template.sampleId));
    let best: { sampleId: string; mean: number } | null = null;
    for (const candidate of templates) {
      const distances = templates.filter((other) => other.sampleId !== candidate.sampleId)
        .map((other) => dtwDistance(candidate.frames, other.frames));
      const mean = distances.reduce((sum, value) => sum + value, 0) / distances.length;
      if (!best || mean < best.mean) best = { sampleId: candidate.sampleId, mean };
    }
    return usable.find((sample) => sample.id === best?.sampleId) ?? usable[0];
  }

  async getSamples(gestureId: string): Promise<MotionSample[]> {
    return this.database.samples.where('gestureId').equals(gestureId).sortBy('createdAt');
  }

  async exportMemory(): Promise<GestureMemoryExport> {
    const settings = Object.fromEntries((await this.database.settings.toArray()).map((entry) => [entry.key, entry.value]));
    return {
      manifest: {
        format: 'gesture-memory-studio',
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        featureVersion: APP_CONFIG.featureVersion,
        preprocessingVersion: APP_CONFIG.preprocessingVersion,
        qualityPolicyVersion: APP_CONFIG.qualityPolicyVersion,
      },
      gestures: await this.database.gestures.where('profileId').equals(APP_CONFIG.profileId).toArray(),
      samples: await this.database.samples.where('profileId').equals(APP_CONFIG.profileId).toArray(),
      settings,
    };
  }

  async clearAll(): Promise<void> {
    await this.database.transaction('rw', [this.database.gestures, this.database.samples, this.database.templates,
      this.database.calibrations, this.database.settings, this.database.metadata], async () => {
        await Promise.all([
          this.database.gestures.clear(), this.database.samples.clear(), this.database.templates.clear(),
          this.database.calibrations.clear(), this.database.settings.clear(), this.database.metadata.clear(),
        ]);
      });
  }

  async replaceAll(data: GestureMemoryExport): Promise<void> {
    const gestures = data.gestures.map((gesture) => ({ ...structuredClone(gesture), profileId: APP_CONFIG.profileId, motionType: gesture.motionType ?? 'dynamic' }));
    const samples = data.samples.map((sample) => ({ ...structuredClone(sample), profileId: APP_CONFIG.profileId, motionType: sample.motionType ?? 'dynamic' }));
    const templates: RecognitionTemplate[] = samples.map(buildRecognitionTemplate);
    await this.database.transaction('rw', [this.database.gestures, this.database.samples, this.database.templates,
      this.database.calibrations, this.database.settings, this.database.metadata], async () => {
        await Promise.all([
          this.database.gestures.clear(), this.database.samples.clear(), this.database.templates.clear(),
          this.database.calibrations.clear(), this.database.settings.clear(), this.database.metadata.clear(),
        ]);
        await this.database.gestures.bulkAdd(gestures);
        await this.database.samples.bulkAdd(samples);
        await this.database.templates.bulkAdd(templates);
        const revision = await this.incrementMemoryRevision();
        for (const gesture of gestures) {
          const count = samples.filter((sample) => sample.gestureId === gesture.id).length;
          await this.database.calibrations.put(calibrationFor(gesture.id, count, revision));
        }
        await this.database.settings.bulkPut(Object.entries(data.settings).map(([key, value]) => ({ key, value })));
        await this.database.metadata.put({ key: 'derivedFeatureVersion', value: DERIVED_PIPELINE_VERSION });
      });
  }

  async importAsCopies(data: GestureMemoryExport): Promise<void> {
    const existing = await this.database.gestures.where('profileId').equals(APP_CONFIG.profileId).toArray();
    const usedNameKeys = new Set(existing.map((gesture) => gesture.nameKey));
    const gestures: GestureRecord[] = [];
    const samples: MotionSample[] = [];
    const templates: RecognitionTemplate[] = [];
    for (const importedGesture of data.gestures) {
      let candidate = importedGesture.name;
      let normalized = normalizeGestureName(candidate);
      let suffix = 2;
      while (usedNameKeys.has(normalized.nameKey)) {
        const ending = `（匯入 ${suffix++}）`;
        candidate = `${importedGesture.name.slice(0, 60 - ending.length)}${ending}`;
        normalized = normalizeGestureName(candidate);
      }
      usedNameKeys.add(normalized.nameKey);
      const gestureId = crypto.randomUUID();
      const sourceSamples = data.samples.filter((sample) => sample.gestureId === importedGesture.id);
      const expectedHands = importedGesture.mode === 'dual' ? 2 : 1;
      const expectedSides = sourceSamples[0]?.tracks.map((track) => track.side).sort().join(',');
      if (sourceSamples.some((sample) => sample.tracks.length !== expectedHands
        || sample.tracks.map((track) => track.side).sort().join(',') !== expectedSides)) {
        throw new Error(`匯入動作「${importedGesture.name}」的手部 topology 不一致`);
      }
      const idMap = new Map(sourceSamples.map((sample) => [sample.id, crypto.randomUUID()]));
      const now = new Date().toISOString();
      gestures.push({
        ...structuredClone(importedGesture), id: gestureId, profileId: APP_CONFIG.profileId,
        name: normalized.name, nameKey: normalized.nameKey,
        motionType: importedGesture.motionType ?? 'dynamic',
        representativeSampleId: importedGesture.representativeSampleId ? idMap.get(importedGesture.representativeSampleId) ?? null : null,
        revision: 1, createdAt: now, updatedAt: now,
      });
      for (const source of sourceSamples) {
        const sample: MotionSample = {
          ...structuredClone(source), id: idMap.get(source.id)!, gestureId, profileId: APP_CONFIG.profileId,
          motionType: source.motionType ?? importedGesture.motionType ?? 'dynamic',
        };
        samples.push(sample);
        templates.push(buildRecognitionTemplate(sample));
      }
    }
    await this.database.transaction('rw', [this.database.gestures, this.database.samples, this.database.templates,
      this.database.calibrations, this.database.metadata], async () => {
        await this.database.gestures.bulkAdd(gestures);
        await this.database.samples.bulkAdd(samples);
        await this.database.templates.bulkAdd(templates);
        const revision = await this.incrementMemoryRevision();
        const currentCalibrations = await this.database.calibrations.toArray();
        await this.database.calibrations.bulkPut(currentCalibrations.map((record) => ({ ...record, status: 'stale', memoryRevision: revision })));
        await this.database.calibrations.bulkPut(gestures.map((gesture) => calibrationFor(
          gesture.id, samples.filter((sample) => sample.gestureId === gesture.id).length, revision,
        )));
        await this.database.metadata.put({ key: 'derivedFeatureVersion', value: DERIVED_PIPELINE_VERSION });
      });
  }
}
