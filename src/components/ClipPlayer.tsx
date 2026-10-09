import { useEffect, useMemo, useRef, useState } from 'react';
import type { MotionSample } from '../core/types';
import { buildPlaybackClip } from '../core/playback/buildPlaybackClip';
import { advancePlaybackTime } from '../core/playback/samplePlaybackPose';
import { HandScene, type CameraPreset, type HandViewMode } from '../rendering/HandScene';
import { PlaybackControls } from './PlaybackControls';

export function ClipPlayer({ sample, compact = false }: { sample: MotionSample; compact?: boolean }) {
  const clipResult = useMemo(() => {
    try { return { clip: buildPlaybackClip(sample), error: '' }; }
    catch (error) { return { clip: null, error: error instanceof Error ? error.message : '無法建立重播' }; }
  }, [sample]);
  const [playing, setPlaying] = useState(false);
  const [timeMs, setTimeMs] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);
  const [trajectory, setTrajectory] = useState(true);
  const [debug, setDebug] = useState(false);
  const [viewMode, setViewMode] = useState<HandViewMode>('glb');
  const [preset, setPreset] = useState<CameraPreset>('front');
  const [resetToken, setResetToken] = useState(0);
  const lastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    setTimeMs(0);
    setPlaying(false);
  }, [sample.id]);

  useEffect(() => {
    if (!playing || !clipResult.clip) {
      lastTimeRef.current = null;
      return;
    }
    let handle = 0;
    const tick = (now: number) => {
      const elapsed = lastTimeRef.current === null ? 0 : now - lastTimeRef.current;
      lastTimeRef.current = now;
      setTimeMs((current) => {
        const advanced = advancePlaybackTime(current, elapsed, speed, clipResult.clip!.durationMs, loop);
        if (advanced.ended) setPlaying(false);
        return advanced.timeMs;
      });
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [clipResult.clip, loop, playing, speed]);

  if (!clipResult.clip) return <div className="notice danger">無法重播：{clipResult.error}</div>;
  const clip = clipResult.clip;
  return (
    <div className={`clip-player ${compact ? 'compact-player' : ''}`}>
      <HandScene clip={clip} timeMs={timeMs} showTrajectory={trajectory} debugSkeleton={debug} viewMode={viewMode} cameraPreset={preset} resetToken={resetToken} />
      <div className="scene-toolbar" aria-label="3D 視角控制">
        <label>顯示<select aria-label="手部顯示模式" value={viewMode} onChange={(event) => setViewMode(event.target.value as HandViewMode)}>
          <option value="glb">GLB 手部</option><option value="raw">原始估計骨架</option><option value="fitted">擬合骨架</option>
        </select></label>
        {(['front', 'side', 'back'] as const).map((view) => (
          <button type="button" key={view} className={`chip ${preset === view ? 'active' : ''}`} onClick={() => setPreset(view)}>
            {view === 'front' ? '正面' : view === 'side' ? '側面' : '背面'}
          </button>
        ))}
        <button type="button" className="chip" onClick={() => setResetToken((value) => value + 1)}>重設視角</button>
        <label className="check"><input type="checkbox" checked={trajectory} onChange={(event) => setTrajectory(event.target.checked)} /> 軌跡</label>
        <label className="check"><input type="checkbox" checked={debug} onChange={(event) => setDebug(event.target.checked)} /> 疊加估計骨架</label>
      </div>
      <PlaybackControls playing={playing} timeMs={timeMs} durationMs={clip.durationMs} speed={speed} loop={loop}
        onPlayingChange={setPlaying} onSeek={setTimeMs} onSpeedChange={setSpeed} onLoopChange={setLoop} />
      <details className="rig-diagnostics">
        <summary>模型與重播診斷</summary>
        <dl><div><dt>渲染</dt><dd>{viewMode === 'glb' ? 'GLB SkinnedMesh' : viewMode === 'raw' ? '原始估計骨架' : '固定中位骨長擬合'}</dd></div>
          <div><dt>手側</dt><dd>{sample.tracks.map((track) => track.side).join('＋')}</dd></div>
          <div><dt>root 軌跡</dt><dd>{Object.values(clip.trajectoryByTrack).reduce((sum, points) => sum + points.length, 0)} 點</dd></div>
          <div><dt>播放時間</dt><dd>{Math.round(timeMs)} / {Math.round(clip.durationMs)} ms</dd></div></dl>
        <p>GLB 只套用本片段的 root、掌部方向與指節方向；資產內建動畫未啟用。原始估計與固定骨長擬合可分開檢視。</p>
      </details>
      {clip.warnings.map((warning) => <div className="notice warning" key={warning}>{warning}</div>)}
    </div>
  );
}
