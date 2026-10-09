import Dexie, { type EntityTable } from 'dexie';
import type { CalibrationRecord, GestureRecord, MotionSample, RecognitionTemplate } from '../types';
import { APP_CONFIG } from '../../app/config';

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
    const stores = {
      gestures: 'id, &[profileId+nameKey], profileId, updatedAt',
      samples: 'id, gestureId, profileId, createdAt',
      templates: 'sampleId, gestureId, profileId, [featureVersion+preprocessingVersion]',
      calibrations: 'gestureId, profileId, status',
      settings: 'key',
      metadata: 'key',
    };
    this.version(1).stores(stores);
    this.version(2).stores(stores).upgrade(async (transaction) => {
      await transaction.table<GestureRecord>('gestures').toCollection().modify((gesture) => {
        gesture.motionType ??= 'dynamic';
      });
      await transaction.table<MotionSample>('samples').toCollection().modify((sample) => {
        sample.motionType ??= 'dynamic';
      });
      await transaction.table<RecognitionTemplate>('templates').clear();
      await transaction.table<CalibrationRecord>('calibrations').toCollection().modify((calibration) => {
        calibration.status = 'stale';
        calibration.featureVersion = APP_CONFIG.featureVersion;
        calibration.preprocessingVersion = APP_CONFIG.preprocessingVersion;
      });
      await transaction.table<MetadataRecord>('metadata').put({ key: 'derivedFeatureVersion', value: 'rebuild-required' });
    });
  }
}

export const db = new GestureDatabase();
