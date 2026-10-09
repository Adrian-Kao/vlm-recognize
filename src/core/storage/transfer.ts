import { gestureMemoryExportSchema } from '../schemas';
import type { GestureMemoryExport } from '../types';
import { APP_CONFIG } from '../../app/config';

export function serializeMemory(data: GestureMemoryExport): string {
  return JSON.stringify(data);
}

export function parseMemoryJson(text: string): GestureMemoryExport {
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > APP_CONFIG.import.maxBytes) throw new Error('匯入檔案超過 50 MB 上限');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('檔案不是有效的 JSON');
  }
  const result = gestureMemoryExportSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`匯入格式錯誤：${issue.path.join('.')} ${issue.message}`);
  }
  return result.data;
}

export function downloadMemory(data: GestureMemoryExport): void {
  const blob = new Blob([serializeMemory(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `gesture-memory-${new Date().toISOString().slice(0, 10)}.gesture-memory.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
