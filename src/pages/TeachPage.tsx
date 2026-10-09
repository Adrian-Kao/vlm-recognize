import { useCallback, useEffect, useRef, useState } from 'react';
import type { GestureRepository } from '../core/storage/GestureRepository';
import type { GestureLibraryEntry, HandMode, MotionSample, RawMotionFrame } from '../core/types';
import { CameraPreview, type CameraFramePacket } from '../components/CameraPreview';
import { createMotionSample, type CaptureContext } from '../core/motion/createMotionSample';
import { assessMotionQuality, isQualityAcceptable } from '../core/motion/quality';
import { QualitySummary } from '../components/QualitySummary';
import { ClipPlayer } from '../components/ClipPlayer';
import { GestureLibrary } from '../components/GestureLibrary';
import { APP_CONFIG } from '../app/config';

interface Props {
  repository: GestureRepository;
  entries: GestureLibraryEntry[];
  refreshLibrary: () => Promise<void>;
}

export function TeachPage({ repository, entries, refreshLibrary }: Props) {
  const [mode, setMode] = useState<HandMode>('single');
  const [mirror, setMirror] = useState(true);
  const [showLandmarks, setShowLandmarks] = useState(true);
  const [cameraActive, setCameraActive] = useState(false);
  const [trackingLabel, setTrackingLabel] = useState('尚無追蹤資料');
  const [countdown, setCountdown] = useState(0);
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [preview, setPreview] = useState<MotionSample | null>(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const frameBuffer = useRef<RawMotionFrame[]>([]);
  const captureContext = useRef<CaptureContext | null>(null);
  const recordingRef = useRef(false);
  const modeRef = useRef(mode);
  const countdownTimer = useRef<number | null>(null);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => () => { if (countdownTimer.current !== null) window.clearInterval(countdownTimer.current); }, []);

  const finishRecording = useCallback(() => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    setRecording(false);
    try {
      if (!captureContext.current) throw new Error('缺少擷取資訊');
      const sample = createMotionSample(frameBuffer.current, modeRef.current, captureContext.current);
      setPreview(sample);
      setMessage(sample.quality.warnings.length === 0 ? '錄製完成。請預覽、裁切並命名。' : '錄製完成，但品質不足；請檢查後重錄。');
    } catch (error) {
      setPreview(null);
      setMessage(error instanceof Error ? error.message : '無法建立錄製片段');
    }
  }, []);

  const onFrame = useCallback((packet: CameraFramePacket) => {
    setTrackingLabel(packet.frame.hands.length === 0 ? '未偵測到手' : `${packet.frame.hands.map((hand) => hand.side === 'Unknown' ? '未知手' : hand.side === 'Left' ? '左手' : '右手').join('＋')}追蹤中`);
    if (!recordingRef.current) return;
    frameBuffer.current.push(structuredClone(packet.frame));
    captureContext.current = {
      source: packet.source,
      videoWidth: packet.videoWidth,
      videoHeight: packet.videoHeight,
      previewMirrored: mirror,
      modelSha256: packet.modelSha256,
    };
    const duration = packet.frame.tMs - frameBuffer.current[0].tMs;
    setElapsedMs(duration);
    if (duration >= APP_CONFIG.maxDurationMs) finishRecording();
  }, [finishRecording, mirror]);

  const beginCountdown = () => {
    if (!cameraActive) { setMessage('請先啟用攝影機並等待追蹤就緒。'); return; }
    setPreview(null);
    setMessage('倒數結束後開始，請讓整隻手保持在畫面內。');
    setCountdown(3);
    if (countdownTimer.current !== null) window.clearInterval(countdownTimer.current);
    countdownTimer.current = window.setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          if (countdownTimer.current !== null) window.clearInterval(countdownTimer.current);
          countdownTimer.current = null;
          frameBuffer.current = [];
          captureContext.current = null;
          recordingRef.current = true;
          setRecording(true);
          setElapsedMs(0);
          return 0;
        }
        return value - 1;
      });
    }, 1_000);
  };

  const changeTrim = (key: 'startMs' | 'endMs', value: number) => {
    if (!preview) return;
    const nextTrim = { ...preview.trim, [key]: value };
    if (nextTrim.endMs - nextTrim.startMs < APP_CONFIG.minDurationMs) return;
    const qualityFrames = preview.rawFrames.filter((frame) => frame.tMs >= nextTrim.startMs && frame.tMs <= nextTrim.endMs);
    setPreview({ ...preview, trim: nextTrim, quality: assessMotionQuality(qualityFrames, mode) });
  };

  const save = async () => {
    if (!preview) return;
    if (!isQualityAcceptable(preview.quality)) { setMessage('品質檢查未通過，不能把不完整片段存入記憶庫。'); return; }
    try {
      const gesture = await repository.saveNamedSample(name, mode, preview);
      await refreshLibrary();
      setMessage(`已儲存到「${gesture.name}」。同名可繼續追加不同速度與幅度的示範。`);
      setPreview(null);
      setName('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '儲存失敗，資料未寫入');
    }
  };

  return (
    <main className="page teach-page">
      <header className="page-heading">
        <div><span className="step-index">01</span><span className="eyebrow">TEACH A MOTION</span><h1>新增動作</h1></div>
        <p>錄下 0.5–8 秒的完整連續動作。系統保存逐幀原始 landmarks 與時間戳，不保存攝影機影片。</p>
      </header>
      <div className="workspace-grid">
        <div className="primary-column">
          <div className="control-strip">
            <label>手部模式<select value={mode} onChange={(event) => setMode(event.target.value as HandMode)} disabled={recording || countdown > 0}>
              <option value="single">單手</option><option value="dual">雙手（基礎）</option>
            </select></label>
            <label className="check"><input type="checkbox" checked={mirror} onChange={(event) => setMirror(event.target.checked)} /> 鏡像預覽</label>
            <label className="check"><input type="checkbox" checked={showLandmarks} onChange={(event) => setShowLandmarks(event.target.checked)} /> landmarks overlay</label>
            <span className="tracking-pill">{trackingLabel}</span>
          </div>
          <div className="camera-wrap">
            <CameraPreview mirror={mirror} showLandmarks={showLandmarks} mode={mode} onFrame={onFrame} onActiveChange={setCameraActive} />
            {countdown > 0 && <div className="countdown" aria-live="assertive">{countdown}</div>}
            {recording && <div className="recording-badge"><span /> REC {(elapsedMs / 1000).toFixed(1)}s</div>}
          </div>
          <div className="record-actions">
            {!recording
              ? <button type="button" className="button primary large" onClick={beginCountdown} disabled={countdown > 0}>錄製一次</button>
              : <button type="button" className="button danger large" onClick={finishRecording}>停止錄製</button>}
            <span>倒數 3 秒不計入片段；達 8 秒會自動停止。</span>
          </div>
        </div>
        <aside className="side-column">
          <span className="eyebrow">RECORDING CHECK</span><h2>片段預覽</h2>
          {!preview ? <div className="empty-state tall"><strong>等待一次錄製</strong><p>錄製後會立即以程序化立體手預覽實際片段。</p></div> : (
            <>
              <QualitySummary sample={preview} />
              <ClipPlayer sample={preview} compact />
              <div className="trim-controls">
                <label>起點 {Math.round(preview.trim.startMs)} ms<input type="range" min={0} max={preview.trim.endMs - APP_CONFIG.minDurationMs} value={preview.trim.startMs}
                  onChange={(event) => changeTrim('startMs', Number(event.target.value))} /></label>
                <label>終點 {Math.round(preview.trim.endMs)} ms<input type="range" min={preview.trim.startMs + APP_CONFIG.minDurationMs}
                  max={preview.rawFrames.at(-1)?.tMs ?? preview.trim.endMs} value={preview.trim.endMs}
                  onChange={(event) => changeTrim('endMs', Number(event.target.value))} /></label>
                <small>裁切只更新 metadata；完整 raw frames 不會被覆寫。</small>
              </div>
              <label className="field">自訂名稱<input value={name} maxLength={60} placeholder="例如：我的下一頁" onChange={(event) => setName(event.target.value)} /></label>
              <div className="button-row">
                <button className="button primary" type="button" onClick={() => void save()} disabled={!name.trim() || !isQualityAcceptable(preview.quality)}>儲存動作</button>
                <button className="button ghost" type="button" onClick={() => setPreview(null)}>丟棄</button>
              </div>
            </>
          )}
          {message && <div className="notice" role="status">{message}</div>}
        </aside>
      </div>
      <GestureLibrary entries={entries} repository={repository} onChanged={refreshLibrary} />
    </main>
  );
}
