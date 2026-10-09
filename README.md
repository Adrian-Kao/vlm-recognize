# Gesture Memory Studio

一個完全在瀏覽器本機運作的個人化連續手部動作系統。它保存使用者實際錄製的逐幀手部 motion sequence，使用多變量 DTW 辨識，並依名稱取回同一份原始資料做 3D 重播。

這不是單張手勢分類器，也不會依名稱生成一段未曾示範的動畫。

## 已完成的三個流程

1. **新增動作**：明確要求攝影機權限，以 MediaPipe Hand Landmarker 逐幀擷取；3 秒倒數、0.5–8 秒錄製、品質檢查、非破壞式裁切、自訂名稱、同名追加多份示範。
2. **辨識動作**：手動切段與停頓式自動切段；同時比較手形、掌部方向、影像平面手腕軌跡、雙手相對位置與時間順序；輸出 `recognized`、`unknown`、`ambiguous` 或 `invalid`。辨識片段只有經使用者確認才會追加。
3. **名稱 → 3D 重現**：名稱／別名搜尋，取回實際保存的 clip；程序化有厚度手掌、五指與關節，同步雙手重播；支援 OrbitControls、正／側／背面、播放／暫停、進度、0.25–2×、循環、軌跡及除錯骨架。

資料保存於 IndexedDB（Dexie），可重新整理讀回、重新命名、選代表樣本、刪除、JSON 匯出與經 schema 驗證後匯入。攝影機 RGB 影像不會被保存或上傳。

## 安裝與啟動

需求：Node.js `^20.19.0` 或 `>=22.12.0`（依 Vite 8 engines）、支援 WebGL／Web Worker／IndexedDB 的現代瀏覽器。

```bash
npm install
npm run setup:assets
npm run dev
```

開啟 Vite 顯示的 localhost 網址。攝影機只可在安全來源（`localhost` 或 HTTPS）使用。`setup:assets` 會驗證已安裝的 `@mediapipe/tasks-vision` WASM，並從 Google 官方模型位置下載 Hand Landmarker float16 v1；腳本會檢查大小、計算並記錄 SHA-256。WASM module loader 與 binary 由 Vite `?url` 資產管線處理，不從 `public/` 當作原始碼匯入。

## 驗證命令

```bash
npm run typecheck
npm run lint
npm run test -- --run
npx playwright install chromium   # 新環境只需一次
npm run test:e2e
npm run build
```

Playwright 啟動時會設定 `VITE_TEST_TRACKER=1`，頁面會以黃色橫幅明確標示合成追蹤。這只驗證流程、持久化與控制項，不代表真實攝影機／MediaPipe 已實測。

## 資料與座標

- `MotionSample.rawFrames` 保存未平滑、未補點的嚴格遞增時間戳，以及每幀完整的 21 點 image/world landmarks、左右手、track 與診斷資訊。
- `RecognitionTemplate` 是可重建的 derived data，與原始重播資料分表；改名只更新 `GestureRecord` metadata。
- image x/y 先依影片寬高轉為像素，再以整段穩定掌部尺度正規化。`localPose` 保留局部 3D 手形及相機相對方向；`rootXY` 保留整隻手在影像平面的移動。
- 3D 重播使用局部 world landmarks 加 image wrist XY。根節點 Z 固定為 0；MediaPipe world landmarks 的手中心原點不被宣稱為全域 3D 位置。
- 自拍鏡像只套用在預覽與 overlay，不改寫推論輸入、儲存值或辨識特徵。

詳見 [架構說明](docs/architecture.md)、[決策與限制](docs/decisions.md) 與 [真人相機驗收](docs/manual-camera-test.md)。

## 已知限制

- 目前未在本開發環境以真人攝影機驗證追蹤方向、裝置效能或辨識率；請依驗收文件實測。合成測試不能取代此步驟。
- 單鏡頭無法量測可靠的全域深度；大幅前後推動只會保留局部手指深度，不會被誤稱為精密 motion capture。
- 雙手交叉／遮蔽時 association 可能不確定，系統會拒絕該段。V1 假設同一人、一或兩手清楚入鏡。
- `0.35` 最大距離與 `0.15` 類別差距是未校準起始值，不是機率或準確率。每類建議蒐集 3–5 份示範，再以未存入的正例與未知負例校準。
- 模型與 WASM 在執行 `setup:assets` 後由本機伺服器提供；專案沒有宣稱未曾載入網站的瀏覽器能在完全斷網狀態啟動。

## 隱私

本版不含付費 API、雲端資料庫、VLM 或 telemetry。只有 landmarks、時間與 metadata 會在使用者按下儲存後寫入 IndexedDB；不錄音、不做人臉或身分辨識。瀏覽器清除網站資料可能移除記憶，請定期匯出備份。
