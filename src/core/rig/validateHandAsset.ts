import { HAND_RIG_MAP } from './handRigMap';

export type HandAssetValidation =
  | { status: 'ready'; sha256: string }
  | { status: 'error'; message: string };

let cached: Promise<HandAssetValidation> | null = null;

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function validateHandAsset(): Promise<HandAssetValidation> {
  cached ??= (async () => {
    try {
      const url = `${import.meta.env.BASE_URL}${HAND_RIG_MAP.assetPath.replace(/^\//, '')}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.arrayBuffer();
      const header = new TextDecoder('ascii').decode(data.slice(0, 4));
      if (header !== 'glTF') throw new Error('回應不是 GLB（可能是 SPA HTML 或錯誤頁）');
      const sha256 = toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)));
      if (sha256 !== HAND_RIG_MAP.assetSha256) {
        throw new Error(`資產 SHA-256 與 mapping 不符；請重新執行 inspect:hand（${sha256.slice(0, 12)}…）`);
      }
      return { status: 'ready', sha256 };
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : '未知 GLB 載入錯誤' };
    }
  })();
  return cached;
}

export function clearHandAssetValidationCache(): void {
  cached = null;
}

