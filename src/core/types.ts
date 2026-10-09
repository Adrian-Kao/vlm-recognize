export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type HandSide = 'Left' | 'Right' | 'Unknown';
export type HandMode = 'single' | 'dual';
export type TrackRole = 'primary' | 'secondary';

export interface TrackDefinition {
  trackId: string;
  side: HandSide;
  role: TrackRole;
}

export interface RawHandObservation {
  trackId: string;
  side: HandSide;
  handednessScore: number | null;
  imageLandmarks: Vec3[];
  worldLandmarks: Vec3[] | null;
  diagnostics: {
    finite: boolean;
    insideFrame: boolean;
    geometryValid: boolean;
    associationAmbiguous: boolean;
  };
}

export interface RawMotionFrame {
  tMs: number;
  hands: RawHandObservation[];
}

export interface CaptureMetadata {
  source: 'camera' | 'synthetic';
  videoWidth: number;
  videoHeight: number;
  inferenceInputMirrored: false;
  previewMirrored: boolean;
  provider: 'mediapipe-hand-landmarker';
  packageVersion: string;
  modelSha256: string;
  capturedAt: string;
}

export interface MotionQuality {
  validTimeRatio: number;
  maxGapMs: number;
  observedFrameCount: number;
  associationAmbiguous: boolean;
  warnings: string[];
}

export interface MotionSample {
  id: string;
  gestureId: string;
  profileId: string;
  schemaVersion: 1;
  revision: number;
  capture: CaptureMetadata;
  tracks: TrackDefinition[];
  rawFrames: RawMotionFrame[];
  trim: { startMs: number; endMs: number };
  quality: MotionQuality;
  createdAt: string;
}

export interface GestureRecord {
  id: string;
  profileId: string;
  name: string;
  nameKey: string;
  aliases: string[];
  mode: HandMode;
  handednessPolicy: 'match-recording';
  representativeSampleId: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureHand {
  role: TrackRole;
  side: HandSide;
  localPose: number[];
  rootXY: Vec2;
  palmAxes: number[];
}

export interface FeatureFrame {
  phase: number;
  hands: FeatureHand[];
  interHandXY: Vec2 | null;
}

export interface RecognitionTemplate {
  sampleId: string;
  sampleRevision: number;
  gestureId: string;
  profileId: string;
  mode: HandMode;
  featureVersion: string;
  preprocessingVersion: string;
  frames: FeatureFrame[];
  durationMs: number;
  derivedFrom: 'raw-motion';
}

export interface CalibrationRecord {
  gestureId: string;
  profileId: string;
  status: 'uncalibrated' | 'provisional' | 'validated' | 'stale';
  maxDistance: number | null;
  minClassMargin: number | null;
  memoryRevision: number;
  featureVersion: string;
  positiveCount: number;
  negativeCount: number;
  evaluatedAt: string | null;
}

export interface RecognitionCandidate {
  gestureId: string;
  distance: number;
}

export interface RecognitionResult {
  segmentId: string;
  status: 'recognized' | 'unknown' | 'ambiguous' | 'invalid';
  gestureId: string | null;
  matchedSampleId: string | null;
  distance: number | null;
  classMargin: number | null;
  calibrationStatus: CalibrationRecord['status'];
  candidates: RecognitionCandidate[];
  reason: string;
  memoryRevision: number;
}

export interface GestureLibraryEntry {
  gesture: GestureRecord;
  samples: MotionSample[];
  calibration: CalibrationRecord | null;
}

export interface GestureMemoryExport {
  manifest: {
    format: 'gesture-memory-studio';
    schemaVersion: 1;
    exportedAt: string;
    featureVersion: string;
  };
  gestures: GestureRecord[];
  samples: MotionSample[];
  settings: Record<string, unknown>;
}

export interface TrackerDetection {
  side: HandSide;
  handednessScore: number | null;
  imageLandmarks: Vec3[];
  worldLandmarks: Vec3[] | null;
}

export interface PlaybackHandPose {
  trackId: string;
  side: HandSide;
  role: TrackRole;
  joints: Vec3[];
}

export interface PlaybackPose {
  tMs: number;
  hands: PlaybackHandPose[];
}

export interface PlaybackClip {
  sampleId: string;
  durationMs: number;
  startMs: number;
  poses: PlaybackPose[];
  trajectoryByTrack: Record<string, Vec3[]>;
  warnings: string[];
}
