import { afterEach, describe, expect, it } from 'vitest';
import { GestureDatabase } from '../../core/storage/db';
import { GestureRepository } from '../../core/storage/GestureRepository';
import { parseMemoryJson, serializeMemory } from '../../core/storage/transfer';
import { makeSyntheticSample } from '../fixtures/synthetic';

const names: string[] = [];

function createRepository() {
  const name = `gesture-test-${crypto.randomUUID()}`;
  names.push(name);
  const database = new GestureDatabase(name);
  return { database, repository: new GestureRepository(database) };
}

afterEach(async () => {
  for (const name of names.splice(0)) await new GestureDatabase(name).delete();
});

describe('IndexedDB 記憶庫', () => {
  it('關閉並重新建立 repository 後仍能讀到 raw frames', async () => {
    const { database, repository } = createRepository();
    const original = makeSyntheticSample({ path: 'right' });
    await repository.saveNamedSample('我的下一頁', 'single', original);
    const name = database.name;
    database.close();
    const reopenedDb = new GestureDatabase(name);
    const reopened = new GestureRepository(reopenedDb);
    const library = await reopened.listLibrary();
    expect(library[0].gesture.name).toBe('我的下一頁');
    expect(library[0].samples[0].rawFrames).toEqual(original.rawFrames);
    reopenedDb.close();
  });

  it('重新命名只改 metadata，不改原始動畫資料', async () => {
    const { database, repository } = createRepository();
    await repository.saveNamedSample('舊名稱', 'single', makeSyntheticSample());
    const before = await repository.listLibrary();
    const raw = structuredClone(before[0].samples[0].rawFrames);
    await repository.renameGesture(before[0].gesture.id, '新名稱');
    const after = await repository.listLibrary();
    expect(after[0].gesture.name).toBe('新名稱');
    expect(after[0].samples[0].rawFrames).toEqual(raw);
    expect(await repository.search('舊名稱')).toHaveLength(0);
    database.close();
  });

  it('刪除代表樣本後改指向仍存在的真實樣本', async () => {
    const { database, repository } = createRepository();
    await repository.saveNamedSample('滑動', 'single', makeSyntheticSample({ durationMs: 900 }));
    await repository.saveNamedSample('滑動', 'single', makeSyntheticSample({ durationMs: 1_300 }));
    const before = (await repository.listLibrary())[0];
    const representative = before.samples[0].id;
    await repository.setRepresentative(before.gesture.id, representative);
    await repository.deleteSample(representative);
    const after = (await repository.listLibrary())[0];
    expect(after.samples.some((sample) => sample.id === after.gesture.representativeSampleId)).toBe(true);
    database.close();
  });

  it('匯出、清除、匯入後保留時長、點位與左右手', async () => {
    const { database, repository } = createRepository();
    await repository.saveNamedSample('雙手靠近', 'dual', makeSyntheticSample({ mode: 'dual' }));
    const exported = await repository.exportMemory();
    const parsed = parseMemoryJson(serializeMemory(exported));
    await repository.clearAll();
    expect(await repository.listLibrary()).toHaveLength(0);
    await repository.replaceAll(parsed);
    const restored = (await repository.listLibrary())[0].samples[0];
    expect(restored.rawFrames).toEqual(exported.samples[0].rawFrames);
    expect(restored.tracks.map((track) => track.side).sort()).toEqual(['Left', 'Right']);
    expect(restored.trim).toEqual(exported.samples[0].trim);
    database.close();
  });

  it('錯誤版本與非有限數值會在 transaction 前拒絕', async () => {
    const { database, repository } = createRepository();
    await repository.saveNamedSample('保留我', 'single', makeSyntheticSample());
    const exported = await repository.exportMemory();
    const malicious = JSON.parse(JSON.stringify(exported));
    malicious.manifest.schemaVersion = 99;
    expect(() => parseMemoryJson(JSON.stringify(malicious))).toThrow(/匯入格式錯誤/);
    expect((await repository.listLibrary())[0].gesture.name).toBe('保留我');
    database.close();
  });
});
