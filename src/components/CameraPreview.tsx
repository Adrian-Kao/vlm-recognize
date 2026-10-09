import { useCallback, useEffect, useRef, useState } from 'react';
import { HandAssociator } from '../core/tracking/associateHands';
import { MediaPipeWorkerTracker } from '../core/tracking/MediaPipeAdapter';
import type { HandMode, RawMotionFrame } from '../core/types';
import { makeSyntheticDetections } from '../test/fixtures/synthetic';

export interface CameraFramePacket {
  frame: RawMotionFrame;
  videoWidth: number;
  videoHeight: number;
  source: 'camera' | 'synthetic';
  modelSha256: string;
}

interface CameraPreviewProps {
  mirror: boolean;
  showLandmarks: boolean;
  mode: HandMode;
  onFrame: (packet: CameraFramePacket) => void;
  onActiveChange?: (active: boolean) => void;
}

type CameraStatus = 'idle' | 'loading' | 'ready' | 'error';

function drawLandmarks(canvas: HTMLCanvasElement, frame: RawMotionFrame, mirror: boolean): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  if (mirror) {
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
  }
  context.fillStyle = '#b9ff66';
  context.strokeStyle = 'rgba(185, 255, 102, .55)';
  context.lineWidth = 2;
  for (const hand of frame.hands) {
    for (const [x, y] of hand.imageLandmarks) {
      context.beginPath();
      context.arc(x * canvas.width, y * canvas.height, 3, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}

export function CameraPreview({ mirror, showLandmarks, mode, onFrame, onActiveChange }: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef<MediaPipeWorkerTracker | null>(null);
  const associatorRef = useRef(new HandAssociator());
  const animationRef = useRef<number | null>(null);
  const videoCallbackRef = useRef(false);
  const syntheticTimerRef = useRef<number | null>(null);
  const onFrameRef = useRef(onFrame);
  const mirrorRef = useRef(mirror);
  const showLandmarksRef = useRef(showLandmarks);
  const modeRef = useRef(mode);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [detail, setDetail] = useState('尚未啟用攝影機');
  const synthetic = import.meta.env.VITE_TEST_TRACKER === '1'
    && new URLSearchParams(window.location.search).get('syntheticTracker') === '1';

  useEffect(() => { onFrameRef.current = onFrame; }, [onFrame]);
  useEffect(() => { mirrorRef.current = mirror; }, [mirror]);
  useEffect(() => { showLandmarksRef.current = showLandmarks; }, [showLandmarks]);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const stop = useCallback(() => {
    if (animationRef.current !== null) {
      if (videoCallbackRef.current && videoRef.current?.cancelVideoFrameCallback) videoRef.current.cancelVideoFrameCallback(animationRef.current);
      else cancelAnimationFrame(animationRef.current);
    }
    if (syntheticTimerRef.current !== null) window.clearInterval(syntheticTimerRef.current);
    animationRef.current = null;
    syntheticTimerRef.current = null;
    trackerRef.current?.close();
    trackerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    associatorRef.current.reset();
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus('idle');
    setDetail('攝影機已停止');
    onActiveChange?.(false);
  }, [onActiveChange]);

  useEffect(() => stop, [stop]);

  const emitDetections = useCallback((timestampMs: number, detections: ReturnType<typeof makeSyntheticDetections>, width: number, height: number, source: 'camera' | 'synthetic', modelSha256: string) => {
    const hands = associatorRef.current.update(detections, timestampMs);
    const frame: RawMotionFrame = { tMs: timestampMs, hands };
    if (showLandmarksRef.current && canvasRef.current) drawLandmarks(canvasRef.current, frame, mirrorRef.current);
    onFrameRef.current({ frame, videoWidth: width, videoHeight: height, source, modelSha256 });
  }, []);

  const startSynthetic = useCallback(() => {
    setStatus('ready');
    setDetail('合成追蹤測試模式（非真實攝影機）');
    onActiveChange?.(true);
    const start = performance.now();
    syntheticTimerRef.current = window.setInterval(() => {
      const timestamp = performance.now() - start;
      emitDetections(timestamp, makeSyntheticDetections(timestamp, modeRef.current === 'dual'), 640, 480, 'synthetic', 'synthetic-test-data');
    }, 33);
  }, [emitDetections, onActiveChange]);

  const start = useCallback(async () => {
    if (status === 'loading' || status === 'ready') return;
    if (synthetic) {
      startSynthetic();
      return;
    }
    setStatus('loading');
    setDetail('正在要求攝影機權限並載入本機模型…');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('此瀏覽器或來源不支援攝影機；請使用 localhost 或 HTTPS');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      const sessionId = crypto.randomUUID();
      let modelSha256 = 'checksum-file-unavailable';
      try {
        const response = await fetch('/models/hand_landmarker.task.sha256');
        if (response.ok) modelSha256 = (await response.text()).trim().split(/\s+/)[0];
      } catch { /* checksum is documented as unavailable */ }
      const tracker = new MediaPipeWorkerTracker(
        (result) => emitDetections(result.captureTimestampMs, result.detections, video.videoWidth, video.videoHeight, 'camera', modelSha256),
        (message) => { setStatus('error'); setDetail(`追蹤失敗：${message}。請確認已執行 npm run setup:assets。`); },
        (delegate) => { setStatus('ready'); setDetail(`追蹤就緒（${delegate}；影像只在本機處理）`); onActiveChange?.(true); },
      );
      trackerRef.current = tracker;
      await tracker.initialize(sessionId);
      let lastMediaTime = -1;
      const schedule = () => {
        if (!trackerRef.current || !videoRef.current) return;
        if (videoRef.current.requestVideoFrameCallback) {
          videoCallbackRef.current = true;
          animationRef.current = videoRef.current.requestVideoFrameCallback((_now, metadata) => { void frameLoop(metadata.mediaTime * 1000); });
        } else {
          videoCallbackRef.current = false;
          animationRef.current = requestAnimationFrame(() => { void frameLoop(videoRef.current!.currentTime * 1000); });
        }
      };
      const frameLoop = async (captureTimestampMs: number) => {
        if (!trackerRef.current || !videoRef.current) return;
        try {
          if (captureTimestampMs === lastMediaTime) { schedule(); return; }
          lastMediaTime = captureTimestampMs;
          const bitmap = await createImageBitmap(videoRef.current);
          if (!trackerRef.current) { bitmap.close(); return; }
          trackerRef.current.detect(bitmap, captureTimestampMs);
        } catch (error) {
          setStatus('error');
          setDetail(error instanceof Error ? error.message : '無法讀取攝影機影格');
          return;
        }
        schedule();
      };
      schedule();
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStatus('error');
      if (error instanceof DOMException && error.name === 'NotAllowedError') setDetail('攝影機權限被拒絕。請允許此網站使用攝影機後重試。');
      else setDetail(error instanceof Error ? error.message : '無法啟用攝影機');
      onActiveChange?.(false);
    }
  }, [emitDetections, onActiveChange, startSynthetic, status, synthetic]);

  return (
    <section className="camera-card" aria-label="攝影機與手部追蹤">
      {synthetic && <div className="test-banner" role="status">合成追蹤測試模式｜不代表真實攝影機已驗證</div>}
      <div className={`camera-stage ${mirror ? 'mirrored' : ''}`}>
        <video ref={videoRef} muted playsInline aria-label="攝影機預覽" />
        <canvas ref={canvasRef} width={640} height={480} className={showLandmarks ? '' : 'hidden'} aria-hidden="true" />
        {status !== 'ready' && <div className="camera-placeholder"><span>◎</span><p>{status === 'loading' ? '啟動中…' : '攝影機尚未啟用'}</p></div>}
      </div>
      <div className="camera-footer">
        <span className={`status-dot ${status}`} aria-hidden="true" />
        <span>{detail}</span>
        {status === 'ready'
          ? <button type="button" className="button ghost compact" onClick={stop}>停止攝影機</button>
          : <button type="button" className="button compact" onClick={start} disabled={status === 'loading'}>{synthetic ? '啟動合成追蹤' : '啟用攝影機'}</button>}
      </div>
    </section>
  );
}
