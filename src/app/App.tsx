import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GestureLibraryEntry } from '../core/types';
import { GestureRepository } from '../core/storage/GestureRepository';
import { db } from '../core/storage/db';
import { TeachPage } from '../pages/TeachPage';
import { RecognizePage } from '../pages/RecognizePage';
import { PlaybackPage } from '../pages/PlaybackPage';

type Tab = 'teach' | 'recognize' | 'playback';

const tabs: Array<{ id: Tab; number: string; label: string; sub: string }> = [
  { id: 'teach', number: '01', label: '新增動作', sub: '錄製與命名' },
  { id: 'recognize', number: '02', label: '辨識動作', sub: '完整時序比對' },
  { id: 'playback', number: '03', label: '3D 重現', sub: '名稱找回實錄' },
];

export default function App() {
  const repository = useMemo(() => new GestureRepository(db), []);
  const [tab, setTab] = useState<Tab>('teach');
  const [entries, setEntries] = useState<GestureLibraryEntry[]>([]);
  const [databaseError, setDatabaseError] = useState('');
  const refreshLibrary = useCallback(async () => {
    try { setEntries(await repository.listLibrary()); setDatabaseError(''); }
    catch (error) { setDatabaseError(error instanceof Error ? `無法讀取 IndexedDB：${error.message}` : '無法讀取本機資料'); }
  }, [repository]);

  useEffect(() => { void refreshLibrary(); }, [refreshLibrary]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => setTab('teach')} aria-label="Gesture Memory Studio 首頁">
          <span className="brand-mark"><i /><i /><i /></span>
          <span><strong>Gesture Memory</strong><small>STUDIO · LOCAL MOTION LAB</small></span>
        </button>
        <div className="privacy-pill"><span /> 本機處理 · 不保存影像</div>
      </header>
      <nav className="tab-nav" aria-label="三個核心流程">
        {tabs.map((item) => <button type="button" key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>
          <span>{item.number}</span><strong>{item.label}</strong><small>{item.sub}</small>
        </button>)}
      </nav>
      {databaseError && <div className="global-error" role="alert">{databaseError}</div>}
      {tab === 'teach' && <TeachPage repository={repository} entries={entries} refreshLibrary={refreshLibrary} />}
      {tab === 'recognize' && <RecognizePage repository={repository} entries={entries} refreshLibrary={refreshLibrary} goTeach={() => setTab('teach')} />}
      {tab === 'playback' && <PlaybackPage repository={repository} entries={entries} />}
      <footer><span>Gesture Memory Studio v0.1</span><span>個人化連續動作記憶 · 不含 VLM 或雲端依賴</span></footer>
    </div>
  );
}
