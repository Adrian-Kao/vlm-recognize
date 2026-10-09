import { useEffect, useState } from 'react';
import type { GestureRepository } from '../core/storage/GestureRepository';
import type { GestureLibraryEntry, MotionSample } from '../core/types';
import { ClipPlayer } from '../components/ClipPlayer';

interface Props { repository: GestureRepository; entries: GestureLibraryEntry[] }

export function PlaybackPage({ repository, entries }: Props) {
  const [query, setQuery] = useState('');
  const [selectedGestureId, setSelectedGestureId] = useState<string | null>(null);
  const [selectedSample, setSelectedSample] = useState<MotionSample | null>(null);
  const [samples, setSamples] = useState<MotionSample[]>([]);
  const candidates = entries.filter(({ gesture }) => {
    const q = query.trim().normalize('NFC').toLocaleLowerCase();
    return q && (gesture.nameKey.includes(q) || gesture.aliases.some((alias) => alias.toLocaleLowerCase().includes(q)));
  });

  const choose = async (gestureId: string) => {
    setSelectedGestureId(gestureId);
    const all = await repository.getSamples(gestureId);
    setSamples(all);
    setSelectedSample(await repository.selectPlaybackSample(gestureId));
  };

  useEffect(() => {
    if (selectedGestureId && !entries.some(({ gesture }) => gesture.id === selectedGestureId)) {
      setSelectedGestureId(null); setSelectedSample(null); setSamples([]);
    }
  }, [entries, selectedGestureId]);

  const selectedEntry = entries.find(({ gesture }) => gesture.id === selectedGestureId);
  return (
    <main className="page playback-page">
      <header className="page-heading">
        <div><span className="step-index">03</span><span className="eyebrow">RECALL IN 3D</span><h1>3D 重現</h1></div>
        <p>依名稱取回真正錄製過的 clip。此頁不需要攝影機權限，也不會根據名稱生成想像動畫。</p>
      </header>
      <div className="search-panel">
        <label className="search-box"><span>⌕</span><input aria-label="搜尋已儲存的動作" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="輸入已儲存的動作名稱…" /></label>
        {query.trim() && candidates.length === 0 && <div className="notice warning">尚未記錄這個動作。請先到「新增動作」示範並儲存。</div>}
        {candidates.length > 0 && <div className="candidate-chips">{candidates.map(({ gesture, samples: list }) => (
          <button type="button" className={`candidate-card ${selectedGestureId === gesture.id ? 'active' : ''}`} key={gesture.id} onClick={() => void choose(gesture.id)}>
            <strong>{gesture.name}</strong><span>{list.length} 份真實示範</span>
          </button>
        ))}</div>}
      </div>
      {!selectedSample ? <div className="empty-stage"><span>3D</span><h2>從名稱找回你的動作</h2><p>只有實際儲存的片段才能在這裡重播。</p></div> : (
        <section className="playback-workspace">
          <div className="playback-meta">
            <div><span className="eyebrow">PLAYING RECORDED CLIP</span><h2>{selectedEntry?.gesture.name}</h2></div>
            <label>示範版本<select value={selectedSample.id} onChange={(event) => setSelectedSample(samples.find((sample) => sample.id === event.target.value) ?? null)}>
              {samples.map((sample, index) => <option key={sample.id} value={sample.id}>#{index + 1} · {new Date(sample.createdAt).toLocaleString('zh-TW')} · {((sample.trim.endMs - sample.trim.startMs) / 1000).toFixed(1)}s</option>)}
            </select></label>
          </div>
          <ClipPlayer sample={selectedSample} />
          <p className="technical-note">此重播使用 MediaPipe 估計的局部 3D 手形，加上原始影像平面的手腕軌跡。場景 Z 軸根節點固定為 0，不代表量測到全域深度。</p>
        </section>
      )}
    </main>
  );
}
