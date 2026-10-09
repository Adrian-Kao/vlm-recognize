import type { TrackerDetection } from '../types';

export interface TrackerFrameResult {
  sessionId: string;
  requestId: number;
  captureTimestampMs: number;
  detections: TrackerDetection[];
}

export interface TrackerProvider {
  readonly status: 'idle' | 'loading' | 'ready' | 'failed' | 'closed';
  initialize(sessionId: string): Promise<void>;
  detect(frame: ImageBitmap, captureTimestampMs: number): boolean;
  close(): void;
}
