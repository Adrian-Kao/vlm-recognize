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
- `templates` 是 `featureVersion=motion-features-v2-shape-reliability`、`preprocessingVersion=preprocess-v2-gap-policy` 的可重建 cache。Dexie v2 migration 不改 rawFrames，只補動作類型、清除舊 derived templates 並將 calibration 標為 stale；repository 再以 transaction 重建。
- `gestureId` 是穩定關聯鍵，名稱不作檔案或動畫索引。
- 新增／刪除／匯入會增加 `memoryRevision`；少於三份樣本保持 `uncalibrated`，三份以上為 `provisional`，其他受影響的校準會標記 `stale`。
- 多表修改使用單一 IndexedDB transaction；匯入全部驗證成功後才寫入。

## 辨識

裁切後片段依實際時間戳重採樣為 64 個 phase。每手保留 63 維 wrist-relative local pose、2 維 root XY、6 維 palm axes，新增關節彎曲、tip-to-MCP／掌心距離、捏合與張合形狀；雙手另含 inter-hand XY。可靠性由幾何、骨長合理性、track 身分與 evidence 類型衍生，不是 MediaPipe 逐點 confidence。DTW 以區塊權重乘兩側可靠性；共同有效及非 root 資訊不足時 cost 為不可比對，不以 epsilon 產生假零距離。

## 3D

`MotionSample → buildPlaybackClip → samplePlaybackPose → canonical rig target → GLB local quaternions`。播放仍使用原始時間軸，不使用辨識的 64 格序列。GLB magic/hash 驗證通過後，每個觀測手各以 `SkeletonUtils.clone` 建立獨立 skeleton；建立 binding 時另以實際指骨旋轉驗證有權重頂點確實位移。每幀先回 rest transform，再驅動 root、palm 與 15 個骨段，忽略資產 Idle 動畫。程序化有體積手保留為明示 fallback／擬合檢視，raw skeleton 另行顯示。OrbitControls 只改 camera，不改 motion data。
