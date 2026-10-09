interface PlaybackControlsProps {
  playing: boolean;
  timeMs: number;
  durationMs: number;
  speed: number;
  loop: boolean;
  onPlayingChange: (playing: boolean) => void;
  onSeek: (timeMs: number) => void;
  onSpeedChange: (speed: number) => void;
  onLoopChange: (loop: boolean) => void;
}

function formatTime(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(2)} 秒`;
}

export function PlaybackControls(props: PlaybackControlsProps) {
  return (
    <div className="playback-controls">
      <div className="transport-row">
        <button type="button" className="button icon" aria-label="回到開頭" onClick={() => props.onSeek(0)}>↶</button>
        <button type="button" className="button primary transport" onClick={() => props.onPlayingChange(!props.playing)}>
          {props.playing ? '暫停' : '播放'}
        </button>
        <span className="time-readout">{formatTime(props.timeMs)} / {formatTime(props.durationMs)}</span>
      </div>
      <label className="range-label">
        <span>播放進度</span>
        <input aria-label="播放進度" type="range" min={0} max={props.durationMs} step={1} value={props.timeMs}
          onChange={(event) => props.onSeek(Number(event.target.value))} />
      </label>
      <div className="playback-options">
        <label>速度
          <select aria-label="播放速度" value={props.speed} onChange={(event) => props.onSpeedChange(Number(event.target.value))}>
            {[0.25, 0.5, 1, 1.5, 2].map((speed) => <option key={speed} value={speed}>{speed}×</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={props.loop} onChange={(event) => props.onLoopChange(event.target.checked)} /> 循環播放</label>
      </div>
    </div>
  );
}
