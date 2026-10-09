import type { TrackerProvider, TrackerFrameResult } from './TrackerProvider';
import type { TrackingWorkerResponse } from '../../workers/messages';
import { MEDIAPIPE_ASSETS } from '../../app/config';

export class MediaPipeWorkerTracker implements TrackerProvider {
  status: TrackerProvider['status'] = 'idle';
  private worker: Worker | null = null;
  private sessionId = '';
  private requestId = 0;
  private inFlight = false;

  constructor(
    private readonly onResult: (result: TrackerFrameResult) => void,
    private readonly onError: (message: string) => void,
    private readonly onReady: (delegate: 'GPU' | 'CPU') => void,
  ) {}

  initialize(sessionId: string): Promise<void> {
    this.close();
    this.status = 'loading';
    this.sessionId = sessionId;
    this.worker = new Worker(new URL('../../workers/tracking.worker.ts', import.meta.url), { type: 'module' });
    return new Promise((resolve, reject) => {
      const handle = (event: MessageEvent<TrackingWorkerResponse>) => {
        const message = event.data;
        if (message.sessionId !== this.sessionId) return;
        if (message.type === 'ready') {
          this.status = 'ready';
          this.onReady(message.delegate);
          resolve();
        } else if (message.type === 'error') {
          this.status = 'failed';
          this.inFlight = false;
          this.onError(message.message);
          reject(new Error(message.message));
        } else {
          this.inFlight = false;
          this.onResult(message);
        }
      };
      this.worker!.onmessage = handle;
      this.worker!.onerror = (event) => {
        this.status = 'failed';
        this.inFlight = false;
        const message = event.message || 'Tracking Worker 啟動失敗';
        this.onError(message);
        reject(new Error(message));
      };
      this.worker!.postMessage({
        type: 'init',
        sessionId,
        modelPath: MEDIAPIPE_ASSETS.modelPath,
      });
    });
  }

  detect(frame: ImageBitmap, captureTimestampMs: number): boolean {
    if (this.status !== 'ready' || !this.worker || this.inFlight) {
      frame.close();
      return false;
    }
    this.inFlight = true;
    this.worker.postMessage({
      type: 'frame',
      sessionId: this.sessionId,
      requestId: ++this.requestId,
      captureTimestampMs,
      bitmap: frame,
    }, [frame]);
    return true;
  }

  close(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'close', sessionId: this.sessionId });
      this.worker.terminate();
    }
    this.worker = null;
    this.status = 'closed';
    this.inFlight = false;
    this.sessionId = '';
  }
}
