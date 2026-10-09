import { useRef, useState } from 'react';
import type { GestureLibraryEntry } from '../core/types';
import type { GestureRepository } from '../core/storage/GestureRepository';
import { downloadMemory, parseMemoryJson } from '../core/storage/transfer';

interface Props {
  entries: GestureLibraryEntry[];
  repository: GestureRepository;
  onChanged: () => Promise<void>;
}

const calibrationLabel = {
  uncalibrated: '未校準',
  provisional: '暫定校準',
  validated: '已驗證',
  stale: '校準已過期',
} as const;

export function GestureLibrary({ entries, repository, onChanged }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<'copy' | 'replace'>('copy');
  const [message, setMessage] = useState('');

  const run = async (action: () => Promise<void>, success: string) => {
    try { await action(); await onChanged(); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : '操作失敗'); }
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const data = parseMemoryJson(await file.text());
      if (importMode === 'replace') {
        if (!window.confirm('這會先清除目前記憶庫，再匯入備份。確定繼續？')) return;
        await repository.replaceAll(data);
      } else {
        await repository.importAsCopies(data);
      }
      await onChanged();
      setMessage(`已匯入 ${data.gestures.length} 個動作；derived features 已由原始資料重建。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '匯入失敗；原資料未變更');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <section className="library-panel">
      <div className="section-heading">
        <div><span className="eyebrow">本機 IndexedDB</span><h2>動作記憶庫</h2></div>
        <div className="toolbar">
          <button className="button ghost compact" type="button" onClick={() => run(async () => downloadMemory(await repository.exportMemory()), '備份已下載')}>匯出</button>
          <label className="compact-select">匯入方式
            <select value={importMode} onChange={(event) => setImportMode(event.target.value as 'copy' | 'replace')}>
              <option value="copy">新增副本</option><option value="replace">取代全部</option>
            </select>
          </label>
          <button className="button ghost compact" type="button" onClick={() => fileRef.current?.click()}>匯入</button>
          <input ref={fileRef} className="visually-hidden" type="file" accept=".json,.gesture-memory.json,application/json"
            onChange={(event) => void importFile(event.target.files?.[0])} />
        </div>
      </div>
      {message && <div className="notice" role="status">{message}</div>}
      {entries.length === 0 ? <div className="empty-state"><strong>記憶庫目前是空的</strong><p>錄下第一個連續動作後，它會出現在這裡。</p></div> : (
        <div className="library-list">
          {entries.map(({ gesture, samples, calibration }) => (
            <article className="gesture-row" key={gesture.id}>
              <div className="gesture-main">
                <span className="gesture-icon">{gesture.mode === 'dual' ? '雙' : '單'}</span>
                <div><strong>{gesture.name}</strong><span>{samples.length} 份示範 · {(gesture.motionType ?? 'dynamic') === 'static-hold' ? '靜態保持' : '連續動態'} · {calibration ? calibrationLabel[calibration.status] : '未校準'}</span></div>
              </div>
              <div className="sample-list">
                {samples.map((sample, index) => (
                  <div className="sample-item" key={sample.id}>
                    <span>#{index + 1} · {(sample.trim.endMs - sample.trim.startMs).toFixed(0)} ms · {sample.capture.source === 'camera' ? '攝影機' : '合成測試'}</span>
                    <label className="check"><input type="radio" name={`representative-${gesture.id}`}
                      checked={gesture.representativeSampleId === sample.id}
                      onChange={() => void run(() => repository.setRepresentative(gesture.id, sample.id), '代表樣本已更新')} /> 代表</label>
                    <button type="button" className="text-button danger-text" onClick={() => {
                      if (window.confirm('確定刪除這份示範？')) void run(() => repository.deleteSample(sample.id), '樣本已刪除');
                    }}>刪除</button>
                  </div>
                ))}
              </div>
              <div className="row-actions">
                <button type="button" className="text-button" onClick={() => {
                  const name = window.prompt('新的動作名稱', gesture.name);
                  if (name) void run(() => repository.renameGesture(gesture.id, name), '名稱已更新；原始動作資料未改動');
                }}>重新命名</button>
                <button type="button" className="text-button danger-text" onClick={() => {
                  if (window.confirm(`確定刪除「${gesture.name}」與所有示範？`)) void run(() => repository.deleteGesture(gesture.id), '動作已刪除');
                }}>刪除動作</button>
              </div>
            </article>
          ))}
        </div>
      )}
      {entries.length > 0 && <button type="button" className="text-button danger-text clear-all" onClick={() => {
        if (window.confirm('這會清除所有本機動作記憶，且只能由匯出備份復原。確定？')) void run(() => repository.clearAll(), '本機記憶庫已清除');
      }}>清除全部本機資料</button>}
    </section>
  );
}
