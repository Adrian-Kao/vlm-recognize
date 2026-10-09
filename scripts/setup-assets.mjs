import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageWasm = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const modelDirectory = join(root, 'public', 'models');
const modelPath = join(modelDirectory, 'hand_landmarker.task');
const checksumPath = `${modelPath}.sha256`;
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function verifyWasm() {
  const files = (await readdir(packageWasm)).filter((name) => name.endsWith('.js') || name.endsWith('.wasm'));
  if (files.length === 0) throw new Error('找不到 @mediapipe/tasks-vision WASM；請先執行 npm install');
  return files.length;
}

async function ensureModel() {
  await mkdir(modelDirectory, { recursive: true });
  try {
    const info = await stat(modelPath);
    if (info.size > 1_000_000) {
      const checksum = await sha256(modelPath);
      await writeFile(checksumPath, `${checksum}  hand_landmarker.task\n`, 'utf8');
      return { downloaded: false, bytes: info.size, checksum };
    }
  } catch { /* download below */ }

  const response = await fetch(modelUrl, { redirect: 'follow' });
  if (!response.ok) throw new Error(`下載 Hand Landmarker 模型失敗：HTTP ${response.status}`);
  const data = new Uint8Array(await response.arrayBuffer());
  if (data.byteLength < 1_000_000) throw new Error('下載內容過小，不像有效的 Hand Landmarker 模型');
  await writeFile(modelPath, data);
  const checksum = await sha256(modelPath);
  await writeFile(checksumPath, `${checksum}  hand_landmarker.task\n`, 'utf8');
  return { downloaded: true, bytes: data.byteLength, checksum };
}

const wasmCount = await verifyWasm();
const model = await ensureModel();
console.log(`MediaPipe WASM：已驗證套件內 ${wasmCount} 個同版本檔案；Vite 會以 ?url 打包 module loader 與 binary`);
console.log(`Hand Landmarker：${model.downloaded ? '已下載' : '已驗證既有檔案'}，${model.bytes} bytes`);
console.log(`SHA-256：${model.checksum}`);
console.log(`來源：${modelUrl}`);
