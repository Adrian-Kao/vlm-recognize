/// <reference lib="webworker" />
import { classifySample } from '../core/recognition/classify';
import type { RecognitionWorkerRequest, RecognitionWorkerResponse } from './messages';

self.onmessage = (event: MessageEvent<RecognitionWorkerRequest>) => {
  const message = event.data;
  try {
    const result = classifySample(message.sample, message.memory, message.segmentId);
    const response: RecognitionWorkerResponse = {
      type: 'result',
      sessionId: message.sessionId,
      segmentId: message.segmentId,
      result,
    };
    self.postMessage(response);
  } catch (error) {
    const response: RecognitionWorkerResponse = {
      type: 'error',
      sessionId: message.sessionId,
      segmentId: message.segmentId,
      message: error instanceof Error ? error.message : '辨識 Worker 發生錯誤',
    };
    self.postMessage(response);
  }
};
