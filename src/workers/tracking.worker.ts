/// <reference lib="webworker" />
import { HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url';
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url';
import type { HandSide, TrackerDetection, Vec3 } from '../core/types';
import type { TrackingWorkerRequest, TrackingWorkerResponse } from './messages';

let landmarker: HandLandmarker | null = null;
let activeSession = '';
let lastTimestamp = -1;

function post(response: TrackingWorkerResponse): void {
  self.postMessage(response);
}

function mapResult(result: HandLandmarkerResult): TrackerDetection[] {
  return result.landmarks.map((landmarks, index) => {
    const category = result.handedness[index]?.[0];
    const label = category?.categoryName;
    const side: HandSide = label === 'Left' || label === 'Right' ? label : 'Unknown';
    const world = result.worldLandmarks[index];
    return {
      side,
      handednessScore: Number.isFinite(category?.score) ? category.score : null,
      imageLandmarks: landmarks.map((point) => [point.x, point.y, point.z] as Vec3),
      worldLandmarks: world?.length === 21 ? world.map((point) => [point.x, point.y, point.z] as Vec3) : null,
    } satisfies TrackerDetection;
  });
}

async function initialize(message: Extract<TrackingWorkerRequest, { type: 'init' }>): Promise<void> {
  activeSession = message.sessionId;
  lastTimestamp = -1;
  try {
    const vision = { wasmLoaderPath: wasmLoaderUrl, wasmBinaryPath: wasmBinaryUrl };
    try {
      landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: message.modelPath, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      post({ type: 'ready', sessionId: activeSession, delegate: 'GPU' });
    } catch {
      landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: message.modelPath, delegate: 'CPU' },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      post({ type: 'ready', sessionId: activeSession, delegate: 'CPU' });
    }
  } catch (error) {
    post({ type: 'error', sessionId: activeSession, message: error instanceof Error ? error.message : 'MediaPipe 模型載入失敗' });
  }
}

self.onmessage = async (event: MessageEvent<TrackingWorkerRequest>) => {
  const message = event.data;
  if (message.type === 'init') {
    landmarker?.close();
    landmarker = null;
    await initialize(message);
    return;
  }
  if (message.type === 'close') {
    if (message.sessionId === activeSession) {
      landmarker?.close();
      landmarker = null;
      activeSession = '';
    }
    return;
  }
  if (message.sessionId !== activeSession || !landmarker) {
    message.bitmap.close();
    return;
  }
  try {
    const timestamp = Math.max(message.captureTimestampMs, lastTimestamp + 0.001);
    lastTimestamp = timestamp;
    const result = landmarker.detectForVideo(message.bitmap, timestamp);
    post({
      type: 'result',
      sessionId: message.sessionId,
      requestId: message.requestId,
      captureTimestampMs: message.captureTimestampMs,
      detections: mapResult(result),
    });
  } catch (error) {
    post({ type: 'error', sessionId: message.sessionId, message: error instanceof Error ? error.message : '手部追蹤失敗' });
  } finally {
    message.bitmap.close();
  }
};
