import { classifySample, type ClassificationMemory } from './classify';
import type { MotionSample, RecognitionResult } from '../types';
import type { RecognitionWorkerResponse } from '../../workers/messages';

export class RecognitionClient {
  private worker: Worker | null = null;
  private sessionId = crypto.randomUUID();
  private pending = new Map<string, { resolve: (result: RecognitionResult) => void; reject: (error: Error) => void }>();
  degraded = false;

  private ensureWorker(): void {
    if (this.worker || this.degraded) return;
    try {
      this.worker = new Worker(new URL('../../workers/recognition.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<RecognitionWorkerResponse>) => {
        const message = event.data;
        if (message.sessionId !== this.sessionId) return;
        const pending = this.pending.get(message.segmentId);
        if (!pending) return;
        this.pending.delete(message.segmentId);
        if (message.type === 'result') pending.resolve(message.result);
        else pending.reject(new Error(message.message));
      };
      this.worker.onerror = () => {
        this.degraded = true;
        this.worker?.terminate();
        this.worker = null;
        for (const pending of this.pending.values()) pending.reject(new Error('Recognition Worker 執行失敗'));
        this.pending.clear();
      };
    } catch {
      this.degraded = true;
    }
  }

  async classify(sample: MotionSample, memory: ClassificationMemory, segmentId: string = crypto.randomUUID()): Promise<RecognitionResult> {
    this.ensureWorker();
    if (!this.worker) return classifySample(sample, memory, segmentId);
    return new Promise<RecognitionResult>((resolve, reject) => {
      this.pending.set(segmentId, { resolve, reject });
      this.worker!.postMessage({ type: 'classify', sessionId: this.sessionId, segmentId, sample, memory });
    }).catch(() => {
      this.degraded = true;
      return classifySample(sample, memory, segmentId);
    });
  }

  close(): void {
    this.worker?.terminate();
    this.worker = null;
    this.sessionId = crypto.randomUUID();
    for (const pending of this.pending.values()) pending.reject(new Error('辨識工作已取消'));
    this.pending.clear();
  }
}
