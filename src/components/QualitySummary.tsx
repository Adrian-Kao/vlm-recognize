import type { MotionSample } from '../core/types';
import { isQualityAcceptable } from '../core/motion/quality';

export function QualitySummary({ sample }: { sample: MotionSample }) {
  const quality = sample.quality;
  const valid = isQualityAcceptable(quality);
  return (
    <div className={`quality-card ${valid ? 'valid' : 'invalid'}`}>
      <div>
        <span className="eyebrow">片段品質</span>
        <strong>{valid ? '可儲存／可辨識' : 'Invalid｜請重新錄製'}</strong>
      </div>
      <dl>
        <div><dt>有效追蹤</dt><dd>{Math.round(quality.validTimeRatio * 100)}%</dd></div>
        <div><dt>觀測影格</dt><dd>{quality.observedFrameCount}</dd></div>
        <div><dt>最大缺口</dt><dd>{Math.round(quality.maxGapMs)} ms</dd></div>
      </dl>
      {quality.warnings.length > 0 && <ul>{quality.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
    </div>
  );
}
