import type { MotionSample, RecognitionResult, TrackerDetection } from '../core/types';
import type { ClassificationMemory } from '../core/recognition/classify';

export type TrackingWorkerRequest =
  | { type: 'init'; sessionId: string; modelPath: string }
  | { type: 'frame'; sessionId: string; requestId: number; captureTimestampMs: number; bitmap: ImageBitmap }
  | { type: 'close'; sessionId: string };

export type TrackingWorkerResponse =
  | { type: 'ready'; sessionId: string; delegate: 'GPU' | 'CPU' }
  | { type: 'result'; sessionId: string; requestId: number; captureTimestampMs: number; detections: TrackerDetection[] }
  | { type: 'error'; sessionId: string; message: string };

export type RecognitionWorkerRequest = {
  type: 'classify';
  sessionId: string;
  segmentId: string;
  sample: MotionSample;
  memory: ClassificationMemory;
};

export type RecognitionWorkerResponse =
  | { type: 'result'; sessionId: string; segmentId: string; result: RecognitionResult }
  | { type: 'error'; sessionId: string; segmentId: string; message: string };
