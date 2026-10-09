import Dexie, { type EntityTable } from 'dexie';
import type { CalibrationRecord, GestureRecord, MotionSample, RecognitionTemplate } from '../types';

export interface SettingRecord {
  key: string;
  value: unknown;
}

export interface MetadataRecord {
  key: string;
  value: unknown;
}

export class GestureDatabase extends Dexie {
  gestures!: EntityTable<GestureRecord, 'id'>;
  samples!: EntityTable<MotionSample, 'id'>;
  templates!: EntityTable<RecognitionTemplate, 'sampleId'>;
  calibrations!: EntityTable<CalibrationRecord, 'gestureId'>;
  settings!: EntityTable<SettingRecord, 'key'>;
  metadata!: EntityTable<MetadataRecord, 'key'>;

  constructor(name = 'gesture-memory-studio') {
    super(name);
    this.version(1).stores({
      gestures: 'id, &[profileId+nameKey], profileId, updatedAt',
      samples: 'id, gestureId, profileId, createdAt',
      templates: 'sampleId, gestureId, profileId, [featureVersion+preprocessingVersion]',
      calibrations: 'gestureId, profileId, status',
      settings: 'key',
      metadata: 'key',
    });
  }
}

export const db = new GestureDatabase();
