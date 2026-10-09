# 架構與資料流

## 執行緒邊界

- React 主執行緒：UI、camera preview、錄製控制、IndexedDB 交易與 3D Canvas。
- `tracking.worker.ts`：載入同版本 MediaPipe WASM／模型並同步呼叫 `detectForVideo`。主執行緒最多送出一個 in-flight `ImageBitmap`，忙碌時直接略過新影格。
- `recognition.worker.ts`：重建版本化時序特徵並執行 DTW。Worker 啟動或執行失敗時，可降級到相同純函式的主執行緒路徑，UI 會提示。
- `sessionId`、`requestId`、`segmentId` 與 `memoryRevision` 防止過期結果覆寫新 session／新記憶庫狀態。

換頁或停止攝影機會停止全部 media tracks、取消 video-frame callback、終止 tracking worker，並讓 ImageBitmap 在 worker finally 區塊關閉。

## 儲存分層

Dexie tables：`gestures`、`samples`、`templates`、`calibrations`、`settings`、`metadata`。

- `samples` 是權威 raw motion，永遠保留原始時間戳與量測。
- `templates` 是 `featureVersion=motion-features-v1`、`preprocessingVersion=preprocess-v1` 的可重建 cache。
- `gestureId` 是穩定關聯鍵，名稱不作檔案或動畫索引。
- 新增／刪除／匯入會增加 `memoryRevision`；少於三份樣本保持 `uncalibrated`，三份以上為 `provisional`，其他受影響的校準會標記 `stale`。
- 多表修改使用單一 IndexedDB transaction；匯入全部驗證成功後才寫入。

## 辨識

裁切後片段依實際時間戳重採樣為 64 個 phase。每手特徵為 63 維 wrist-relative local pose、2 維 root XY、6 維 palm axes；雙手另含 inter-hand XY。DTW 使用 Sakoe–Chiba band 與固定步進，在類別內取距離最小的真實樣本，再套用絕對距離與不同類別 margin 拒絕規則。

## 3D

`MotionSample → buildPlaybackClip → samplePlaybackPose → ProceduralHand`。播放仍使用原始時間軸，不使用辨識的 64 格序列。每段指骨是有體積 capsule，關節為球體，掌部為依 palm axes 定向的有厚度 box。OrbitControls 只改 camera，不改 motion data。
