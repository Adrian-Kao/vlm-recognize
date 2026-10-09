import { useCallback, useEffect, useRef, useState } from 'react';
import type { GestureRepository } from '../core/storage/GestureRepository';
import type { GestureLibraryEntry, GestureMotionType, HandMode, MotionSample, RawMotionFrame, RecognitionResult } from '../core/types';
import { CameraPreview, type CameraFramePacket } from '../components/CameraPreview';
import { createMotionSample, type CaptureContext } from '../core/motion/createMotionSample';
import { RecognitionClient } from '../core/recognition/RecognitionClient';
import { MotionSegmenter, type SegmenterState } from '../core/motion/segmenter';
import { APP_CONFIG } from '../app/config';
import { QualitySummary } from '../components/QualitySummary';

interface Props {
  repository: GestureRepository;
  entries: GestureLibraryEntry[];
  refreshLibrary: () => Promise<void>;
  goTeach: () => void;
}

const stateLabels: Record<SegmenterState, string> = {
  NO_HAND: '等待手部', READY: '待命', MOVING: '動作中', HOLDING: '穩定保持中', END_PENDING: '等待動作結束',
  TRACKING_PENDING: '追蹤短缺口等待', CLASSIFYING: '比對中', COOLDOWN: '等待釋放／冷卻',
};

export function RecognizePage({ repository, entries, refreshLibrary, goTeach }: Props) {
  const [mode, setMode] = useState<HandMode>('single');
  const [motionType, setMotionType] = useState<GestureMotionType>('dynamic');
  const [mirror, setMirror] = useState(true);
  const [cameraActive, setCameraActive] = useState(false);
  const [manualRecording, setManualRecording] = useState(false);
  const [autoActive, setAutoActive] = useState(false);
  const [autoState, setAutoState] = useState<SegmenterState>('NO_HAND');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [result, setResult] = useState<RecognitionResult | null>(null);
  const [currentSample, setCurrentSample] = useState<MotionSample | null>(null);
  const [correctionId, setCorrectionId] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const framesRef = useRef<RawMotionFrame[]>([]);
  const captureRef = useRef<CaptureContext | null>(null);
  const manualRef = useRef(false);
  const autoRef = useRef(false);
  const modeRef = useRef(mode);
  const motionTypeRef = useRef(motionType);
  const mirrorRef = useRef(mirror);
  const segmenterRef = useRef(new MotionSegmenter());
  const recognitionRef = useRef<RecognitionClient | null>(null);

  if (!recognitionRef.current) recognitionRef.current = new RecognitionClient();
  useEffect(() => () => recognitionRef.current?.close(), []);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => {
    motionTypeRef.current = motionType;
    segmenterRef.current.setMotionType(motionType);
    setAutoState('NO_HAND');
  }, [motionType]);
  useEffect(() => { mirrorRef.current = mirror; }, [mirror]);
  useEffect(() => { autoRef.current = autoActive; if (!autoActive) segmenterRef.current.reset(); }, [autoActive]);

  const gestureName = (gestureId: string | null) => entries.find(({ gesture }) => gesture.id === gestureId)?.gesture.name ?? '未知動作';

  const recognize = useCallback(async (sample: MotionSample, segmentId: string = crypto.randomUUID()) => {
    setBusy(true);
    setCurrentSample(sample);
    setMessage('正在以完整時序比對本機樣本…');
    try {
      const memory = await repository.getRecognitionMemory();
      let next = await recognitionRef.current!.classify(sample, memory, segmentId);
      const latestRevision = await repository.getMemoryRevision();
      if (latestRevision !== next.memoryRevision) {
        next = await recognitionRef.current!.classify(sample, await repository.getRecognitionMemory(), segmentId);
      }
      setResult(next);
      setMessage(recognitionRef.current!.degraded ? 'Recognition Worker 失敗，已降級在主執行緒完成比對。' : '比對完成。DTW 距離越小越相似，不是正確率或信心。');
    } catch (error) {
      setResult({ segmentId, status: 'invalid', gestureId: null, matchedSampleId: null, distance: null, classMargin: null,
        calibrationStatus: 'uncalibrated', candidates: [], reason: error instanceof Error ? error.message : '辨識失敗', memoryRevision: await repository.getMemoryRevision() });
    } finally { setBusy(false); }
  }, [repository]);

  const makeSample = useCallback((frames: RawMotionFrame[], context: CaptureContext) => createMotionSample(frames, modeRef.current, context, motionTypeRef.current), []);

  const stopManual = useCallback(() => {
    if (!manualRef.current) return;
    manualRef.current = false;
    setManualRecording(false);
    try {
      if (!captureRef.current) throw new Error('尚未收到追蹤影格');
      const sample = makeSample(framesRef.current, captureRef.current);
      void recognize(sample);
    } catch (error) {
      setResult(null);
      setMessage(error instanceof Error ? `Invalid｜${error.message}` : 'Invalid｜無法建立片段');
    }
  }, [makeSample, recognize]);

  const onFrame = useCallback((packet: CameraFramePacket) => {
    const context: CaptureContext = { source: packet.source, videoWidth: packet.videoWidth, videoHeight: packet.videoHeight, previewMirrored: mirrorRef.current, modelSha256: packet.modelSha256 };
    if (manualRef.current) {
      framesRef.current.push(structuredClone(packet.frame));
      captureRef.current = context;
      const duration = packet.frame.tMs - framesRef.current[0].tMs;
      setElapsedMs(duration);
      if (duration >= APP_CONFIG.maxDurationMs) stopManual();
    }
    if (autoRef.current && !manualRef.current) {
      for (const event of segmenterRef.current.push(packet.frame)) {
        if (event.type === 'state') setAutoState(event.state);
        else if (event.type === 'invalid') {
          setMessage(`Invalid｜${event.reason}`);
          setResult(null);
        } else {
          try {
            const sample = makeSample(event.frames, context);
            void recognize(sample, event.segmentId);
          } catch (error) {
            setMessage(error instanceof Error ? `Invalid｜${error.message}` : 'Invalid｜自動片段無效');
          }
        }
      }
    }
  }, [makeSample, recognize, stopManual]);

  const startManual = () => {
    if (!cameraActive) { setMessage('請先啟用攝影機。'); return; }
    setAutoActive(false);
    framesRef.current = [];
    captureRef.current = null;
    manualRef.current = true;
    setManualRecording(true);
    setElapsedMs(0);
    setResult(null);
    setMessage('手動錄製中，完成整段動作後按停止。');
  };

  const confirmCorrection = async () => {
    if (!currentSample || !correctionId) return;
    if (!window.confirm(`確定把這段片段追加到「${gestureName(correctionId)}」？`)) return;
    try {
      await repository.appendSample(correctionId, currentSample);
      await refreshLibrary();
      setMessage('已由你確認追加樣本；系統不會自動吸收預測片段。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '追加失敗'); }
  };

  if (entries.length === 0) {
    return (
      <main className="page recognize-page">
        <header className="page-heading"><div><span className="step-index">02</span><span className="eyebrow">RECOGNIZE A MOTION</span><h1>辨識動作</h1></div></header>
        <div className="empty-stage"><span>∅</span><h2>還沒有可辨識的個人動作</h2><p>系統不預載通用手勢。先錄下並命名至少一個連續動作。</p><button type="button" className="button primary" onClick={goTeach}>先新增動作</button></div>
      </main>
    );
  }

  return (
    <main className="page recognize-page">
      <header className="page-heading">
        <div><span className="step-index">02</span><span className="eyebrow">RECOGNIZE A MOTION</span><h1>辨識動作</h1></div>
        <p>根據整段手形、掌部方向、位移與先後順序，比對你保存的示範；品質不足或不相似時會拒絕。</p>
      </header>
      <div className="workspace-grid recognize-grid">
        <div className="primary-column">
          <div className="control-strip">
            <label>手部模式<select value={mode} onChange={(event) => setMode(event.target.value as HandMode)} disabled={manualRecording || autoActive}><option value="single">單手</option><option value="dual">雙手（基礎）</option></select></label>
            <label>辨識模式<select value={motionType} onChange={(event) => setMotionType(event.target.value as GestureMotionType)} disabled={manualRecording || autoActive}>
              <option value="dynamic">連續動態</option><option value="static-hold">靜態保持</option>
            </select></label>
            <label className="check"><input type="checkbox" checked={mirror} onChange={(event) => setMirror(event.target.checked)} /> 鏡像預覽</label>
            <span className="tracking-pill">自動狀態：{stateLabels[autoState]}</span>
          </div>
          <div className="camera-wrap">
            <CameraPreview mirror={mirror} showLandmarks mode={mode} onFrame={onFrame} onActiveChange={setCameraActive} />
            {manualRecording && <div className="recording-badge"><span /> REC {(elapsedMs / 1000).toFixed(1)}s</div>}
          </div>
          <div className="recognition-modes">
            <article><span className="eyebrow">手動切段</span><h3>按下開始與停止</h3><p>適合沒有明顯停頓或要精確控制片段邊界的動作。</p>
              {!manualRecording ? <button type="button" className="button primary" onClick={startManual}>開始示範</button> : <button type="button" className="button danger" onClick={stopManual}>停止並辨識</button>}
            </article>
            <article><span className="eyebrow">自動切段</span><h3>{motionType === 'static-hold' ? '穩定保持 0.6 秒' : '完成後短暫停頓'}</h3><p>{motionType === 'static-hold' ? '缺口不計入保持時間；辨識一次後必須釋放或明顯改變姿態才會重新觸發。' : '動作開始與停止同時考慮手腕位移與手指形狀變化；每段只觸發一次。'}</p>
              <button type="button" className={`button ${autoActive ? 'danger' : 'ghost'}`} onClick={() => {
                if (!cameraActive) { setMessage('請先啟用攝影機。'); return; }
                setAutoActive((value) => !value);
              }}>{autoActive ? '停止自動辨識' : '啟動自動辨識'}</button>
            </article>
          </div>
        </div>
        <aside className="side-column result-panel">
          <span className="eyebrow">TEMPORAL MATCH</span><h2>辨識結果</h2>
          {busy ? <div className="empty-state tall"><div className="spinner" /><strong>正在比對完整時序</strong></div> : !result ? <div className="empty-state tall"><strong>等待動作片段</strong><p>Unknown、Ambiguous 與 Invalid 都是合法結果。</p></div> : (
            <div className={`recognition-result ${result.status}`}>
              <span className="result-status">{result.status}</span>
              <h3>{result.status === 'recognized' ? gestureName(result.gestureId) : result.status === 'unknown' ? 'Unknown' : result.status === 'ambiguous' ? 'Ambiguous' : 'Invalid'}</h3>
              <p>{result.reason}</p>
              <dl>
                <div><dt>DTW 距離</dt><dd>{result.distance?.toFixed(4) ?? '—'}</dd></div>
                <div><dt>類別差距</dt><dd>{result.classMargin === null ? '無第二類別' : result.classMargin.toFixed(3)}</dd></div>
                <div><dt>校準</dt><dd>{result.calibrationStatus === 'uncalibrated' ? '未校準' : result.calibrationStatus}</dd></div>
              </dl>
              {result.candidates.length > 0 && <ol className="candidate-list">{result.candidates.map((candidate) => <li key={candidate.gestureId}><span>{gestureName(candidate.gestureId)}</span><code>{candidate.distance.toFixed(4)}</code></li>)}</ol>}
            </div>
          )}
          {currentSample && <div className="correction-box"><strong>這次應該是哪個動作？</strong><p>只有按下確認，這段片段才會加入記憶庫。</p><select value={correctionId} onChange={(event) => setCorrectionId(event.target.value)}><option value="">選擇正確名稱</option>{entries.filter(({ gesture }) => (gesture.motionType ?? 'dynamic') === motionType && gesture.mode === mode).map(({ gesture }) => <option key={gesture.id} value={gesture.id}>{gesture.name}</option>)}</select><button className="button ghost" type="button" disabled={!correctionId} onClick={() => void confirmCorrection()}>確認並追加樣本</button></div>}
          {currentSample && <details className="recognition-diagnostics"><summary>分層追蹤／切段診斷</summary><QualitySummary sample={currentSample} />
            <p>辨識層：{result?.status ?? '尚未完成'}；GLB 顯示錯誤不會改寫這個分類結果。</p></details>}
          {message && <div className="notice" role="status">{message}</div>}
          <p className="technical-note">目前門檻是未校準的實驗起始值；距離不是機率。建議每類先錄 3–5 份，再以未加入模板的新示範驗收。</p>
        </aside>
      </div>
    </main>
  );
}
