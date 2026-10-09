# Gesture Memory Studio｜連續手部動作記憶、辨識與 3D 重現

> 交付對象：Codex／開發代理。文件版本：1.0；日期：2026-10-09。
> 本文件是待實作的工程規格，不是已完成或已通過實測的應用程式。
> 除另列來源的 API 與工具能力外，流程、演算法組合、參數及驗收方式均為本專案的設計決策。數值是開發起始值或驗收目標，不是實測結果。

## 0. 專案目的與不可誤解的定義

建立一個以瀏覽器為主要介面的個人化動作系統，讓使用者完成三件事：

1. **新增動作**：面對攝影機示範一段具有時間順序的手部動作，輸入任意名稱，儲存示範。可對同名動作追加不同速度、幅度的示範。
2. **辨識動作**：再次示範時，系統根據整段動作的手形、移動軌跡與先後順序，辨識使用者先前定義的名稱；不認識或無法區分時必須拒絕判定。
3. **名稱 → 3D 重現**：輸入已儲存的名稱，讀取該動作的原始時序資料，以可旋轉視角的 3D 手重播。

「反向顯示」在本專案是 **名稱查詢 → 取回已記錄的 Motion Clip → 3D 重播**，不是倒放影片，也不是憑一個名稱生成從未示範的動作。

「記憶」是持久化的動作示範與標籤關聯，不是每次示範都重新訓練 VLM。**辨識特徵不能代替可重播資料；不得宣稱一般 embedding 可以唯一還原原動作。**

### 專案定位

核心採用：

**Hand Tracking + Temporal Template Matching + Persistent Motion Memory + 3D Playback**。

第一版不依賴大型 VLM，不需要付費 API、雲端推論或重新訓練模型。若後續加入 VLM，僅用於描述、說明、語意查詢等輔助工作；使用者自行命名的標籤與已儲存動作才是權威資料。不得把未接 VLM 的版本宣稱為已完成自訓 VLM。

## 1. 第一版範圍

### 必須完成

- 三個主要頁籤：「新增動作」「辨識動作」「3D 重現」。
- 真實攝影機與逐幀手部追蹤，而非預製結果。
- 0.5–8 秒的連續動作片段；錄製上限、品質限制可集中設定。
- 單手完整流程；最多兩手的資料格式、基本辨識與同步重播。先打通單手，再實作雙手；不可把雙手交叉遮蔽的可靠追蹤視為既成能力。
- 一次示範即可儲存、重播及試辨識，但顯示「樣本不足／未校準」。介面建議每個動作蒐集 3–5 次示範。
- IndexedDB 持久化、重新整理後仍可讀取、重新命名、追加／刪除樣本、匯出／匯入。
- 保留動作方向、先後順序與整隻手在畫面中的移動。
- 手動切段辨識，以及動作間有短暫停頓時的自動切段辨識。
- Unknown、Ambiguous、Invalid 分開處理，不強迫每段動作匹配某個名稱。
- 真正立體的手掌及五指，可拖曳觀察視角，具備播放、暫停、進度拖曳、速度與循環控制。
- 自動測試、實機驗收清單、安裝說明、第三方資產紀錄。

### 本版不承諾

- 未示範過的文字 → 新動作生成。
- 任意手語翻譯、臉部／全身語意或物體互動理解。
- 不同攝影角度、嚴重遮蔽或所有使用者之間的無條件泛化。
- 單鏡頭取得精密、可量測的手掌全域 3D 位置。
- 不經驗證的「95% 準確率」「99% 信心」或即時效能保證。
- 不需停頓、沒有任何分隔的任意長動作串流辨識；自動分段的第一版需要動作間短暫停頓，並保留手動切段。
- 利用辨識結果直接操作系統、付款、刪檔或其他外部命令。本版只顯示結果及播放動作。

## 2. 技術選擇與開源策略

| 層級 | 選擇 | 本專案用途 |
|---|---|---|
| 網頁 | React + TypeScript + Vite | 介面、狀態、打包；既有專案若相容則沿用 |
| 手部感知 | `@mediapipe/tasks-vision` Hand Landmarker | 影像／world landmarks 與左右手資訊 [S1][S2][S3] |
| 3D | Three.js + `@react-three/fiber`，必要時 `@react-three/drei` | 立體手、相機、控制器、光照；Fiber 是 Three.js 的 React renderer [S5][S7] |
| 本機儲存 | Dexie + IndexedDB | 動作、樣本、設定與索引，不啟用 Dexie Cloud [S8] |
| 時序辨識 | 自行實作可測試的多變量 DTW | 使用 TypeScript 在 Worker 中比對；演算法參考 tslearn 文件 [S9][S10] |
| 平滑 | 輕量時間感知低通；可選 1€ Filter | 抑制抖動，參考作者資料，複用程式前確認授權 [S11] |
| 驗證 | Zod 或等價 schema validator | 匯入資料、工作執行緒訊息及儲存資料驗證 |
| 測試 | Vitest + Testing Library + Playwright | 核心單元、元件及端對端測試 |

### 依賴原則

- 開始實作時，查驗實際套件版本、API 與相容性，提交 lockfile。不要憑記憶填寫不存在的版本。
- React、ReactDOM 與 React Three Fiber 使用相容組合；參照官方相容性說明，不直接採用 alpha 作為正式基礎。[S7]
- 無必要不加 Python、FastAPI、向量資料庫、LangChain 或雲端服務；先完成單一前端專案。
- DTW 不是神經網路，不假造「128 維 learned embedding」。V1 使用可解釋的時序特徵；未來可更換 recognizer adapter。
- Three.js 原始碼採 MIT、MediaPipe 儲存庫與 Dexie 原始碼採 Apache-2.0；模型權重、範例資產及第三方 3D 模型需另外核對，不推定全部同授權。[S12][S13][S14]
- 第一版以程式建立手掌和手指，不需要外部手模型。不得以「缺少 hand.glb」阻塞核心流程，也不得引用未知授權資產。
- 若使用外部程式片段或資產，保存來源、版本、授權與必要聲明；未能確認授權時，不直接複製納入發佈。

## 3. 整體資料流

```text
攝影機影格 + 原始時間戳
             │
             ▼
   Hand Landmarker／Tracking Worker
             │
             ▼
    跨幀手部 ID 對應 + 品質檢查
             │
             ▼
      Raw Motion Frames（保留原始值）
             │
      ┌──────┴───────────────────┐
      ▼                          ▼
新增動作                    辨識動作
錄製／裁切                   自動或手動切段
      │                          │
      ▼                          ▼
Motion Sample               同版本特徵處理
      │                          │
      ├─→ 重播處理 → 3D 預覽      ▼
      │                     DTW 類別比對
      └─→ 特徵處理 → Template     │
             │                   ▼
             ▼             品質／距離／類別差距
     Dexie／IndexedDB            │
      名稱、原始序列、版本        ▼
             │           名稱或 Unknown 等狀態
             ▼
輸入名稱 → 找到 Gesture ID → 選擇已存樣本 → 3D 重播
```

**儲存層至少分開兩種資料**：可重算的辨識特徵，以及不可被特徵取代的原始時序資料。重新命名不能改動動畫；更換特徵演算法也不能使重播失效。

## 4. 使用者流程與介面

### 4.1 新增動作

介面包含攝影機畫面、可切換的 landmarks overlay、錄製狀態、秒數、樣本清單與 3D 預覽。

流程：

1. 使用者主動點擊啟用攝影機，不要求麥克風權限。
2. 選擇單手或雙手；顯示手是否完整入鏡、左右手判定及追蹤中斷提示。
3. 點擊「錄製一次」，3 秒倒數後開始。倒數不算入動作片段。
4. 使用者示範，按「停止」結束；上限到達時停止錄製並提示檢查結尾。
5. 顯示品質摘要及可拖曳的頭尾裁切範圍；裁切只改 metadata，不覆寫 raw frames。
6. 立即以剛錄到的資料提供 3D 預覽，允許重錄或丟棄。
7. 輸入名稱，例如「啟動」「向右畫圈」「我的下一頁」。名稱沒有預設語意限制。
8. 儲存並可選擇「再示範一次」，把新樣本加入同一 Gesture ID。

不能只擷取最後一張或只保存一張代表圖片。儲存前要確認片段確實含有效時序，不得將完全沒偵測到手的錄製當作有效樣本。

### 4.2 辨識動作

- 未建立任何動作時，顯示空狀態與「先新增動作」，不得預設系統已學會揮手等類別。
- 提供「自動辨識」與「手動錄一段辨識」兩種模式。
- 自動模式明示：「每個動作完成後，請短暫停頓。」顯示待命、動作中、等待結束、比對中等狀態。
- 最終結果顯示名稱、匹配樣本、DTW 距離與校準狀態。距離越小越相似，不等同正確率。
- 有多類別時可展開前三個**不同類別**候選；不得把同名樣本當成第二名類別。
- Unknown：「這個動作尚未記錄，或與現有動作不夠接近。」
- Ambiguous：「可能是 A 或 B，差異不足；請重新示範或增加區別。」
- Invalid：「手部離開畫面／片段過短／追蹤中斷，無法判斷。」
- 辨識錯誤時，使用者可以明確指定正確名稱並確認追加該段樣本。**不得自動把預測結果加入記憶庫。**
- 每一段動作只發出一次最終結果事件，避免同一動作持續觸發。

### 4.3 名稱 → 3D 重現

- 不開攝影機也能進入此頁，搜尋、檢視及播放既有資料。
- 搜尋優先精確名稱／別名；部分文字匹配只提供候選，讓使用者點選。
- 找不到名稱時顯示「尚未記錄這個動作」，不得自行播放通用動畫。
- 同名多樣本時優先播放使用者指定的代表樣本；未指定則選品質合格的 medoid 樣本，再不行則第一個合格樣本。
- **Medoid 是實際存在、與其他樣本平均距離較小的示範，不是把不同速度的序列直接平均成新動畫。**
- 可切換同名的其他樣本，顯示錄製時間及時長。
- 控制項：播放／暫停、回到開頭、循環、0.25×／0.5×／1×／1.5×／2×、進度拖曳、正面／側面／背面、重設視角、軌跡顯示。
- 3D 視窗預設為有厚度的立體手；線條骨架僅作為除錯選項。
- 全程顯示適度說明：「依單鏡頭估計重現；全域深度未經量測。」

## 5. 資料合約

以下是核心資料結構，不是 SDK 原始輸出型別。實作可新增欄位，但不得移除完整時序、時間戳、座標來源與版本。

```ts
export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type HandSide = 'Left' | 'Right' | 'Unknown';

export interface TrackDefinition {
  trackId: string;                 // 僅在該 sample 中具有穩定意義
  side: HandSide;
  role: 'primary' | 'secondary';
}

export interface RawHandObservation {
  trackId: string;
  side: HandSide;
  handednessScore: number | null;  // 左右手分類分數，不是 landmarks 的準確率
  imageLandmarks: Vec3[];          // 驗證必須恰為 21 點；SDK 原值
  worldLandmarks: Vec3[] | null;   // 預期恰為 21 點；缺少時不得捏造
  diagnostics: {
    finite: boolean;
    insideFrame: boolean;
    geometryValid: boolean;
    associationAmbiguous: boolean;
  };
}

export interface RawMotionFrame {
  tMs: number;                    // 相對 sample 開始，嚴格遞增
  hands: RawHandObservation[];     // 沒偵測到手時為 []，不是 21 個 (0,0,0)
}

export interface CaptureMetadata {
  source: 'camera' | 'synthetic';
  videoWidth: number;
  videoHeight: number;
  inferenceInputMirrored: false;  // V1 一律輸入未鏡像影格
  previewMirrored: boolean;       // 只影響呈現
  provider: 'mediapipe-hand-landmarker';
  packageVersion: string;
  modelSha256: string;
  capturedAt: string;             // ISO 格式日期
}

export interface MotionSample {
  id: string;
  gestureId: string;
  profileId: string;
  schemaVersion: 1;
  revision: number;
  capture: CaptureMetadata;
  tracks: TrackDefinition[];
  rawFrames: RawMotionFrame[];
  trim: { startMs: number; endMs: number };
  quality: {
    validTimeRatio: number;
    maxGapMs: number;
    observedFrameCount: number;
    associationAmbiguous: boolean;
    warnings: string[];
  };
  createdAt: string;
}

export interface GestureRecord {
  id: string;
  profileId: string;
  name: string;
  nameKey: string;
  aliases: string[];
  mode: 'single' | 'dual';
  handednessPolicy: 'match-recording'; // V1 明確區分左右手
  representativeSampleId: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureHand {
  role: 'primary' | 'secondary';
  side: HandSide;
  localPose: number[];            // 21 * 3；保留相對相機的朝向
  rootXY: Vec2;                  // 從片段起點的手腕位移
  palmAxes: number[];            // 兩個正交單位向量，6 維
}

export interface FeatureFrame {
  phase: number;                 // 0..1；僅用於辨識正規化
  hands: FeatureHand[];
  interHandXY: Vec2 | null;
}

export interface RecognitionTemplate {
  sampleId: string;
  sampleRevision: number;
  featureVersion: string;
  preprocessingVersion: string;
  frames: FeatureFrame[];
  durationMs: number;
  derivedFrom: 'raw-motion';
}

export interface CalibrationRecord {
  gestureId: string;
  profileId: string;
  status: 'uncalibrated' | 'provisional' | 'validated' | 'stale';
  maxDistance: number | null;
  minClassMargin: number | null;
  memoryRevision: number;
  featureVersion: string;
  positiveCount: number;
  negativeCount: number;
  evaluatedAt: string | null;
}

export interface RecognitionResult {
  segmentId: string;
  status: 'recognized' | 'unknown' | 'ambiguous' | 'invalid';
  gestureId: string | null;
  matchedSampleId: string | null;
  distance: number | null;
  classMargin: number | null;
  calibrationStatus: CalibrationRecord['status'];
  candidates: Array<{ gestureId: string; distance: number }>;
  reason: string;
  memoryRevision: number;
}
```

### 欄位與關聯規則

- `RawMotionFrame` 保存未平滑、未補點的原始偵測。插值／濾波結果另存 cache 或記憶體，不能冒充原始量測。
- Hand Landmarker 回傳影像座標、world 座標與 handedness；`handednessScore` 僅對應左右手分類。不能自行讀取不存在的逐點 tracking confidence，再拿來判定幾何可靠性。[S2][S3]
- SDK 輸出的 world coordinates 不等於攝影機全域手腕平移；詳細座標策略見下一節。
- 同一動作內所有樣本的 hand mode 與左右手角色需相容。不要在同名動作裡無聲混入不同 hand topology。
- `gestureId` 是穩定關聯鍵，不使用可更改的名稱作為 animation file key。
- 名稱規則：1–60 字元、Unicode NFC、去除頭尾空白；英文搜尋不分大小寫。同 profile 的名稱／別名衝突時要求選擇追加或更名，不覆蓋既有資料。
- 原始資料、derived features、calibration 分開存放；任何前處理變更必須提升版本並重新產生模板。
- 每次新增／刪除樣本或動作均增加 `memoryRevision`；受影響的門檻與跨類別差距校準標記 stale。
- V1 可只提供一個本機 profile。Profile 是資料隔離，不是登入認證，也不是使用者身分辨識。

## 6. 座標、平移與單鏡頭深度

### 6.1 必須理解的 SDK 座標

MediaPipe 影像 landmarks 的 x/y 依影像寬高正規化；其 z 是以手腕為參考的相對深度。World landmarks 是以手的幾何中心為原點的估計 3D 座標。兩種資料都不能直接當成已量測的全域手腕 XYZ。[S2]

因此不能把 world landmarks 每幀畫在原點，就宣稱已重現「整隻手向左滑動」。必須額外保存及使用影像中的手腕軌跡。

### 6.2 一致的資料座標

- 推論始終使用未鏡像的原始 video frame。
- 自拍鏡像只用於畫面與 overlay 的顯示轉換；開關鏡像不得修改儲存值、辨識特徵或名稱對應。
- 畫面中的 x/y 先轉成像素：`p_i = [x_i * W, y_i * H]`。不可直接以 normalized x/y 算距離而忽略長寬比。
- 偵測 provider → 3D view 的座標轉換在單一模組管理；寫入基底測試，不能在多個元件分別「試著反轉 x」。
- 左右方向在 UI 明確標示為「原始鏡頭座標」或「鏡像預覽」，避免使用者把左右相反當成辨識錯誤。

### 6.3 辨識使用的相對座標

對每一個片段，在有效影格上估計穩定的參考尺度，不以每幀不穩定的大小持續重設整段軌跡：

```text
s_px = 片段有效影格的掌部像素尺度中位數
       （可用 wrist→middle MCP 與 index MCP→pinky MCP 長度的組合）
s_world,h = 該手掌部 world 尺度中位數
c0 = 第一個有效影格的手腕位置；雙手時用兩手手腕的共同中心

localPose_h,i(t) = [world_h,i(t) - world_h,wrist(t)] / s_world,h
rootXY_h(t)      = [pixelWrist_h(t) - c0] / s_px
interHandXY(t)   = [pixelWrist_secondary(t) - pixelWrist_primary(t)] / s_px
```

所有除法都要保護 epsilon；尺度過小或掌部基底退化時標記 invalid，而不是產生無限大。

**注意：**`localPose` 去除了每幀手腕位置，`rootXY` 則保留整段移動。兩者必須同時輸入辨識器。不能只留下 localPose。

預設不把手掌旋轉到統一朝向；旋轉方向可能就是動作的一部分。手形、掌部方向與軌跡的相對權重可調整，但不可默默消除動作語意。

### 6.4 3D 重播的可實作基準

第一版採 **立體局部手形 + 影像平面根節點軌跡**，不估計全域深度：

```text
A = 經 provider 座標檢查後的固定座標轉換
    常見起點為 diag(1, -1, -1)，但必須由基底測試及實機方向檢查確認

local_h,i(t) = A * [world_h,i(t) - world_h,wrist(t)] / s_world_scene
root_h(t)    = [(pixelWristX_h(t)-c0.x)/s_px,
               -(pixelWristY_h(t)-c0.y)/s_px,
               0]
scene_h,i(t) = sceneScale * [root_h(t) + local_h,i(t)]
```

- `s_world_scene` 是整個片段的共同 world 尺度；雙手共享場景基準，不能分別對各自做不可見的獨立置中。
- `sceneScale` 是顯示尺度，不宣稱是實際公尺。畫面可標注「展示座標」。
- root 的全域 z 在此模式設為 0，是明確的重建假設；局部手指仍具有估計 z，因此是可觀察不同視角的立體手，而非平面貼圖。
- 不可用 normalized wrist z 當成手腕遠近，因其參考基準不適合這個用途。
- 對著鏡頭大幅前後推動，第一版可能無法忠實重現全域深度；UI、README 與測試報告必須說明。
- 未來若加入相機內參、尺度校準、深度相機或多鏡頭，再提供獨立的 `rootDepthMode`；不能以不明係數假裝已完成真實 3D 校準。

## 7. 時序前處理與品質

### 7.1 時間基準

- 以實際影格的單調時間戳為準，不依賴假設每秒一定有 30 張影格。
- Browser Hand Landmarker 使用 `runningMode: 'VIDEO'` 與 `detectForVideo(frame, timestampMs)`；以目前安裝套件的宣告為準，不複製其他平台的 `LIVE_STREAM` 參數到 Web。[S2][S4]
- 每個 model instance 的推論時間戳嚴格遞增；更換攝影機／重建串流時重設相關 session 與時鐘。
- Raw sample 的 `tMs` 相對錄製起點；掉幀保留時間差，不補造一串等間距原始量測。

### 7.2 品質門檻：集中管理的初始值

| 參數 | 初始值／行為 |
|---|---|
| 最短片段 | 500 ms |
| 最長片段 | 8,000 ms |
| 最少實際觀測影格 | 8 |
| 有效追蹤時間比例 | 至少 0.90；按時間估計，不只計算陣列項目比例 |
| 可插值短缺口 | 不超過 150 ms，且前後 track 身分可信 |
| 明顯追蹤丟失 | 超過 250 ms 視為中斷，停止該次候選並顯示原因 |
| 模式 | 單手需要指定的手；雙手需要兩手，不能退成單手仍接受 |

上表不是已驗證最優值；在 `config.ts` 註記為 tunable defaults。對低幀率裝置應顯示實際情況，不降低品質標準後仍聲稱精確。

### 7.3 平滑與缺點補值

- 原始值永遠保留。輕量低通或 1€ Filter 僅作用於 derived stream；濾波參數依實際 dt 調整。[S11]
- 不對長時間遮蔽做連續手勢補造，也不使用零向量當作有效手。
- 掌部方向基底退化時可短暫沿用上一個有效基底，必须標記推估；超過缺口限制就拒絕該段。
- 推論、錄製、辨識、重播之間共用版本化的座標與前處理實作，避免新增和辨識時使用兩套不同正規化。
- 重播平滑結果應預先產生或可純函式重算；拖曳進度不能因濾波器保留舊狀態而得到不同姿勢。

### 7.4 兩套時間表示

- 辨識：將裁切後片段沿時間插值成 K=64 個 phase samples，保留點的先後順序。K 可設定。
- 重播：使用原本錄製時間戳與時長，不以 64 格固定播放長度代替。
- 辨識用 phase 正規化以容忍速度差；不把實際速度當成預設主要辨識特徵。若未來需要「快做」與「慢做」是不同類別，另增明確的速度敏感模式。

## 8. 跨幀追蹤與雙手

MediaPipe 的結果陣列位置不能當成跨影格穩定 ID。

實作一個最多兩手的 data association：

- 使用手腕位置連續性、掌部尺度、近期運動預測與穩定 handedness 決定配對。
- 最多兩手時直接比較兩種配對成本即可，不必引入大型追蹤框架。
- 配對有最大位移／時間間隔 gate；無合理配對時新建 track 或標記中斷，不把遠處另一隻手硬接上。
- 左右手分類需要短時穩定化，不能單幀翻轉就交換 track。
- 同一手的濾波器狀態綁定 trackId；消失／重現不能繼承另一隻手的濾波狀態。
- 雙手片段使用共同時間軸、共同 root reference，並保存兩手相對位置。
- 雙手交叉且無法確定身分時，該段標記 association ambiguous，不假裝可可靠辨識。
- V1 以同一位使用者、一或兩隻清楚可見的手為使用情境；不處理多人同時伸手。

## 9. 動態辨識器：多變量 DTW

### 9.1 不採用的捷徑

不得以最後一幀、平均姿勢、無序特徵集合、名稱 embedding 或亂數完成辨識。兩段「相同手形集合、相反先後順序」的動作必須能在測試中分開。

### 9.2 特徵區塊

每手使用 `localPose`、`rootXY` 與 `palmAxes`。雙手額外加入 `interHandXY`。掌部基底可由 wrist→middle MCP 與 pinky MCP→index MCP 建構、正交化；對共線／極小向量設保護。

兩幀的局部成本採加權區塊平均平方距離，而不是把所有維度直接相加，使 63 維手形無意壓過 2 維軌跡：

```text
singleHandCost = 0.50 * MSE(localPose)
               + 0.35 * MSE(rootXY)
               + 0.15 * MSE(palmAxes)

dualHandCost   = 0.40 * meanHandMSE(localPose)
               + 0.25 * meanHandMSE(rootXY)
               + 0.15 * meanHandMSE(palmAxes)
               + 0.20 * MSE(interHandXY)
```

以上是起始權重；所有區塊先採約定的無量綱尺度。變更特徵或權重時更新版本、重建模板與校準，不沿用舊 threshold。

### 9.3 明確的 DTW 定義

tslearn 的官方文件可作為多變量 DTW 與路徑約束的參考，但本專案採用以下明確距離，不能與其他實作的預設數值直接混用。[S9][S10]

```text
D[i,j] = localCost(i,j) + min(D[i-1,j], D[i,j-1], D[i-1,j-1])
```

- 以完整序列起點到終點做比對。
- K=64 時，Sakoe–Chiba 型帶寬初始值 r=ceil(0.2*K)。
- 合法步進 `(1,0), (0,1), (1,1)`；路徑成本相同時固定優先對角線，保證重現性。
- 追蹤所選最小**累積成本路徑**的長度 L；最後回傳 `sqrt(D[K-1,K-1] / L)`。
- 上述是對最小累積成本路徑做長度正規化，不宣稱是在所有路徑上最小化平均成本。
- 空序列、非法維度、NaN、不可達路徑應回傳 typed error／invalid，不回傳 0。
- V1 無須複雜 early abandon；若新增剪枝，需證明不會因路徑長度正規化而誤剪。

### 9.4 類別比對

```text
d(gesture g) = min over valid stored templates s of DTW(query, s)
```

先依模式與左右手角色篩選相容模板，再計算各類別距離，排序**不同 Gesture ID**。

- 優先測試約 20 類、每類 5 份示範的規模；這是 benchmark 場景，不是已達成的容量保證。
- 由最近的實際示範作為 matchedSampleId，便於解釋、檢視與修正。
- 單類別也能辨識，但仍要有絕對距離門檻；沒有第二類別時不能捏造 class margin。
- DTW 容忍的時間變形不代表所有快慢差、遮蔽、不同起始相位都自然處理好；用留出示範測試。

### 9.5 Unknown／Ambiguous 與校準

初始開發設定可以為 `maxDistance=0.35`、`minClassMargin=0.15`，但 UI 與設定檔必須註記「未校準的實驗起始值」，不能包裝成模型信心。

```text
d1 = 最佳類別距離
d2 = 次佳不同類別距離
margin = (d2-d1) / max(d2, epsilon)

品質不合格                          → invalid
沒有相容類別                        → unknown
d1 > 該類別距離門檻                 → unknown
存在次佳類別，且 margin < 差距門檻  → ambiguous
其餘                                → recognized
```

若 d1=d2=0，仍屬模糊，不能靠排序第一個類別通過。

校準流程：使用新的正例示範與其他／未知動作負例估計門檻；至少將訓練、門檻選擇及最終測試區分。少量樣本可先做 leave-one-out 的暫定估計，但不得把模板與自己比對所得的 0 距離當成驗證。

新增類別會影響原有類別的第二名候選與拒絕規則，因此 memory revision 改變時需標記過期並重新評估。只有少量正例、缺乏負例時保持 provisional。

## 10. 即時自動分段

### 10.1 狀態機

```text
NO_HAND → READY → MOVING → END_PENDING → CLASSIFYING → COOLDOWN → READY
              ↘ 手動開始／停止可直接產生待辨識片段
任何階段出現長遮蔽、換手身分不確定或取消 → INVALID／NO_HAND
```

起始參數：

- `preRollMs = 250`，避免漏掉動作開頭。
- `startHoldMs = 120`，運動能量連續超過開始門檻才起錄。
- `endHoldMs = 500`，低運動能量持續達此時間後結束；trim 去掉多餘停止尾段但保留使用者有意義的結尾姿勢。
- `cooldownMs = 600`，同時要求重新回到待命條件，防止一次動作重複判定。
- `maxDurationMs = 8000`，超時顯示片段過長，不把任意截斷動作直接當作可靠匹配。
- 運動能量同時包含手腕位移速度與手指／關節形狀變化；只看 wrist speed 會漏掉原地張開握拳。
- `startThreshold` 高於 `stopThreshold` 形成 hysteresis；數值按安靜基線與 feature 尺度調整並可檢視。

### 10.2 邊界行為

- 手離開畫面不是「正常動作結束」的充分證據；避免用遮蔽後的半段動作判定。
- 動作中間刻意停頓超過 endHold，可能被切成兩段；UI 說明限制，提供手動模式與 endHold 設定。
- 同一段動作在小幅抖動下不得反覆 reset 或多次觸發。
- 每個 segment 使用唯一 ID。工作執行緒回傳過期 session／segment 結果時丟棄。
- 最終顯示延遲包含 endHold + 前處理 + 比對；不要宣稱比對計算 100 ms 就代表整體辨識延遲 100 ms。

## 11. 3D 手的實作

### 11.1 預設：程序化立體手

先用 Three.js 幾何建立可執行、沒有外部模型依賴的手：

- 五組分節的手指：使用圓柱／capsule 等有體積幾何，關節採小球或平滑連接。
- 手掌：由 wrist 與各 MCP 位置形成有厚度的掌部網格／幾何，不只畫幾根連線。
- 拇指具有獨立的位置與方向處理；不能假設五指全是平行的三節直棍。
- 左右手的幾何與關鍵點對應要驗證，不以隨意負縮放掩蓋錯誤。
- 配置基本環境光、方向光、適度陰影及中性背景。材質以清楚辨識動作為優先，不要求照片級皮膚。
- 使用 OrbitControls 等控制視角；換視角只改 camera，不改儲存動作。

各節依相鄰 joints 計算位置、方向與長度。可用 `Quaternion.setFromUnitVectors` 對齊幾何主軸，四元數插值使用 `slerp`，避免直接線性插值 Euler angles。[S5]

### 11.2 骨架與外觀不是同一層

建立分離的介面：

```text
MotionSample
  → buildPlaybackClip(sample, playbackVersion)
  → samplePlaybackPose(timeMs)
  → HandRenderer.applyPose(pose)
```

至少包含：

- `ProceduralHandRenderer`：預設完成品，可見立體手掌與指節。
- `LandmarkDebugRenderer`：原始／平滑後 joints overlay，作為驗證，不當成唯一成品。
- 未來 `RiggedHandRenderer`：可替換 adapter，不影響記憶庫與辨識器。

### 11.3 長度穩定與忠實度

- 可從片段估計各指節的中位數長度，沿平滑的骨段方向做有限的骨長穩定，減少重播中手指忽長忽短。
- 必須保留原始 joints 檢視；外觀穩定不代表原始量測已更準。
- 不可因為套用固定預設動作而忽略實際手指彎曲、手掌旋轉或整手位移。
- 骨長穩定、平滑或限位若造成端點偏差，應以可重現的設定記錄；第一版不做醫療或精密運動分析宣稱。

### 11.4 時間與播放控制

- 播放時間由 monotonic clock 與 speed multiplier 推進，不以畫面 render frame count 前進。
- 根據儲存時間戳找相鄰姿態，位移線性插值、旋轉 slerp。1× 播放時長應與 trim 後時長一致。
- 暫停時姿態固定；拖曳任意時間可立即得到該處姿態，無需從頭播放濾波器。
- 環形軌跡、平移、張合等都由原始 clip 驅動，不可把手模型整體持續旋轉當成「重現動作」。
- Loop 的末端接回開頭不必假裝自然銜接；可提供短暫停頓，但不能把插入過渡寫回原始片段。
- 跨長缺口不要補出一段假動畫；顯示缺失提示或拒絕作為合格播放樣本。

### 11.5 可選的 GLB／綁骨手模型

只有在程序化版本完成後才加入。Three.js 的 GLTFLoader 可載入 glTF／GLB，但載入模型不等於完成 landmark-to-rig 對應。[S6]

需額外處理：骨骼名稱、rest pose、bind rotation、局部軸、parent inverse、左右手、拇指與扭轉限制。兩點只能限定骨段方向，不能完整觀測沿骨段的 twist；需要掌部基底或其他假設。資產缺失或授權不清時，回退程序化手，不能空白。

## 12. 執行緒、模型載入與效能

Hand Landmarker 的 Web 偵測呼叫是同步的，官方建議使用 Web Worker 避免阻塞 UI。[S2][S4]

### 架構

- 主執行緒：React UI、camera preview、控制狀態及 3D render。
- Tracking Worker：模型初始化、影格推論；盡可能將逐幀處理移出主執行緒。
- Recognition Worker：特徵處理與 DTW。若初期共用同一 Worker，需確保比對不長時間阻塞追蹤並有量測依據。
- 高頻姿態透過 refs／buffer 傳給 renderer，不要每一幀 setState 讓整個頁面重新 render。

### 影格與資源管理

- 可用 `requestVideoFrameCallback`；不支援時以 requestAnimationFrame 並檢查 video.currentTime 是否改變。
- 使用可轉移影格時，遵守 ImageBitmap 等生命週期，結束使用後 close。
- 每個推論管線最多一個 in-flight frame，busy 時跳過舊影格，不讓待處理影格無限排隊。
- Worker 訊息包含 `sessionId`、`requestId`、`captureTimestampMs`；換頁、停止、切鏡頭後忽略舊結果。
- GPU delegate 失敗時嘗試 CPU；Worker／環境不相容時可降級低幀率主執行緒方案，但要顯示降級狀態。
- 停止攝影機時關閉所有 media tracks；離開相關頁面停止推論／錄製，切到重播不應仍占用攝影機。
- React StrictMode 重複掛載不得建立多套 camera／worker／animation loops。
- 離頁／卸載時 dispose Three.js geometry、materials、textures、controls 與 renderer 所持有資源。

### 資產與離線說明

- `@mediapipe/tasks-vision` 的 JS 與 WASM 使用同版本；打包時複製到站內資產路徑。
- 模型使用官方來源，提供 `setup:assets` 或等價腳本，檢查下載狀態、格式、checksum，並紀錄 model SHA-256。
- 不硬编码猜測的最新版本 CDN；避免專案建置成功但 runtime 找不到 WASM／model。
- 文件區分「本機推論、不上傳影像」與「完全離線啟動」。沒有明確 cache／本機靜態伺服器配置時，不宣稱關網後一定能重新載入網站。
- 本地 localhost 或 HTTPS 部署；攝影機 API 需要安全環境與使用者許可。[S15]

### 開發量測目標，不是保證

在測試報告中記錄裝置、瀏覽器、解析度、delegate、樣本數及實測值。可先以 640×480、15–30 次／秒追蹤、30–60 FPS 的 3D 目標開發；DTW 以 20 類×5樣本×64格測試 p50／p95。另列動作結束等待與總延遲，不能只報 render FPS。

## 13. 儲存、匯出與隱私

### 13.1 IndexedDB 表

建議至少：`gestures`、`samples`、`templates`、`calibrations`、`settings`、`metadata`。

- samples 依 gestureId、profileId 建索引；gesture nameKey 同 profile 下唯一。
- 大型序列不要放在 localStorage。Dexie 只是 IndexedDB 的封裝，不使用其付費同步功能。[S8]
- 同一筆樣本及關聯 metadata 儲存使用 transaction，失敗時不顯示成功。
- 刪除 gesture 時以 transaction 刪除其 samples、templates、calibrations。
- 刪除代表樣本後重選實際存在的樣本；不能留下懸空 ID。
- 改名只更新 metadata，播放及辨識依 ID 關聯繼續工作。

### 13.2 匯出／匯入

匯出帶版本的 JSON，例如 `.gesture-memory.json`，至少含 manifest、gestures、samples、settings 的必要部分；derived templates 可省略並於匯入後重算。

- 保留時間戳、trim、raw image/world landmarks、左右手資訊及來源。
- 匯入先檢查檔案大小、schemaVersion、字元長度、數值有限性、21 點長度、嚴格遞增時間、ID 關聯與資源上限。
- 設定明確上限，例如單檔 50 MB、每樣本 2,000 frames，防止不受控資源消耗；超出時提示而非凍結。
- 未知 schemaVersion 應拒絕或走已寫測試的 migration，不靜默猜欄位。
- 衝突需提供新增副本／明確取代，不默默覆蓋。
- 匯入失敗維持原資料；全部驗證成功後才提交 transaction。
- 匯出再匯入後，raw frames 與時間軸必須等價。

### 13.3 攝影機與動作資料

- 預設只保存手部動作資料，不保存或上傳原始 RGB 影片、不錄音、不讀人臉、不做身分識別。
- UI 提供刪除單動作與清除全部本機資料。清除全部需明確確認。
- 使用者可匯出備份；瀏覽器清除資料可能移除記憶，不能稱為永久保證。
- 可要求 persistent storage，但瀏覽器是否授予需檢查回傳值；沒有授予不表示錯誤，也不保證資料永久存在。[S16]
- 不把完整 landmarks、影片內容或動作名稱送入第三方 telemetry。
- 所有文字以安全文字方式呈現，禁止 `eval` 或以名稱觸發可執行程式。

## 14. 建議模組與目錄

```text
src/
  app/
    App.tsx
    config.ts
  pages/
    TeachPage.tsx
    RecognizePage.tsx
    PlaybackPage.tsx
  components/
    CameraPreview.tsx
    RecordingControls.tsx
    GestureLibrary.tsx
    QualitySummary.tsx
    PlaybackControls.tsx
  core/
    types.ts
    schemas.ts
    tracking/
      TrackerProvider.ts
      MediaPipeAdapter.ts
      associateHands.ts
    motion/
      coordinates.ts
      filters.ts
      quality.ts
      segmenter.ts
      resample.ts
      extractFeatures.ts
    recognition/
      dtw.ts
      classify.ts
      calibration.ts
    playback/
      buildPlaybackClip.ts
      samplePlaybackPose.ts
      handTopology.ts
    storage/
      db.ts
      GestureRepository.ts
      transfer.ts
  rendering/
    HandScene.tsx
    ProceduralHand.tsx
    LandmarkDebug.tsx
  workers/
    tracking.worker.ts
    recognition.worker.ts
    messages.ts
  test/
    fixtures/
    unit/
    integration/
public/
  models/
  mediapipe/wasm/
scripts/
  setup-assets.mjs
tests/e2e/
docs/
  architecture.md
  manual-camera-test.md
  evaluation.md
  decisions.md
README.md
THIRD_PARTY_NOTICES.md
```

目錄可按既有專案調整，不為符合此樹狀圖而破壞現有結構。演算法與儲存層應能在沒有 camera、DOM 或 WebGL 的情況下單元測試。

## 15. 狀態與錯誤設計

所有 async 狀態要有 loading、成功、失敗、取消路徑，至少處理：

- 使用者拒絕攝影機、沒有攝影機、裝置被占用、非安全來源。
- 模型或 WASM 載入失敗、Worker 啟動失敗、WebGL context lost。
- 手部完全未偵測、畫面外、world landmarks 缺少、左右手身分不確定。
- 錄製中換頁、取消、鏡頭中斷；未儲存片段不能悄悄變成正式樣本。
- IndexedDB 寫入失敗、儲存不足、匯入格式錯誤、未知版本。
- 搜尋無結果、重播樣本被刪除、模板版本過期。
- 分類結果回傳前記憶庫被修改：丟棄或重算舊結果，不指向已刪除項目。

錯誤要讓使用者知道可採取的動作，不能只顯示 console stack trace。未實作的選項應禁用並標示，不得保留會產生假成功提示的按鈕。

## 16. 驗收：自動測試

測試使用 seeded、可重現的合成骨架或已授權測試資料。合成資料必須標記 `source: 'synthetic'`，與真人動作庫隔離，不能冒充真實攝影機辨識成果。

### 16.1 核心測試

| 測試 | 預期 |
|---|---|
| 相同序列 | DTW 距離接近 0 |
| 同一路徑不同採樣速度 | 比對原類別，距離小於明顯不同軌跡 |
| 相同手形、向左／向右移 | 可區分；不能因手腕置中而完全相同 |
| 先握拳再張開／先張開再握拳 | 非對稱時序資料可區分 |
| 非對稱序列倒序 | 比同序列時間拉伸距離更大；不把對稱往返序列當作必定可區分的測例 |
| 只改鏡像預覽 | 儲存資料及辨識結果不變 |
| 非正方形影像 | 像素尺度正規化正確，不拉扁軌跡 |
| 缺少 21 點／NaN／零尺度 | 拒絕處理，不產生假 0 距離 |
| 短缺口／長缺口 | 前者按規則插值並標記，後者拒絕 |
| 單手對雙手類別 | 拒絕不相容匹配 |
| 兩手輸出陣列交換 | association 仍保持角色與時間連續性 |
| 同類別多個近似樣本 | 第二候選取不同類別，不取同類別第二份樣本 |
| 只有一個類別且 query 很遠 | Unknown，不是永遠命中唯一類別 |
| 兩類完全相同 | Ambiguous，不因排序先後通過 |
| 無手與手原地靜止 | 不因一般抖動無限觸發辨識 |
| 原地握拳張手 | wrist 不動仍能觸發 motion start |
| 同一 segment | 只有一個 final result event |
| 過期 Worker 訊息 | 不改寫新 session 狀態 |

### 16.2 資料與播放測試

- 儲存後重新建立 repository，仍可讀到同名動作與相同 raw frames。
- 改名後新名稱能搜尋及重播，舊動畫不變。
- 刪除代表樣本後不出現 missing pointer。
- 匯出、清除、匯入後時長、點位與左右手資料保持等價。
- 匯入惡意長度、無效數值或錯誤版本時，原資料不變。
- 播放第一幀／中間／最後一幀位置正確，進度拖曳結果與正常播放到同時點一致。
- 1× 與 0.5× 的播放時長關係正確；變更 render FPS 不改動作速度。
- 剛記錄的 root 位移確實反映在 3D 場景；不能只有手指在原地動。
- 有雙手資料時兩手同步播放並保留相對位置。
- 沒有 camera permission 也能使用動作庫與 3D 播放。
- 停止或換頁後 media tracks、Workers 與 rAF loops 正確清理。

### 16.3 測試界線

Playwright 可用 mock tracker／合成片段驗證流程，但 **mock 通過不等於真實相機、MediaPipe 或手勢辨識已通過實測**。必須在報告清楚區分。

## 17. 驗收：真人攝影機與效能

提供 `docs/manual-camera-test.md`，讓使用者逐項實測。固定同一個人、鏡頭位置與基本光線，以降低第一輪混雜因素。

建議建立至少以下測試動作，名稱可任意替換：

- 相同手形向左滑、向右滑。
- 順時針畫圈、逆時針畫圈。
- 先握拳再張開、先張開再握拳。
- 同一段動作以較快與較慢速度完成。
- 雙手從分開到靠近，以及相反方向；保持清楚入鏡，不以交叉遮蔽作為初始可靠度基準。

每類先收 3–5 份示範，再收**未加入模板庫的新測試示範**。另做未登錄動作、日常調整姿勢、無手畫面與短暫遮蔽，觀察錯誤觸發。

記錄：正確類別、預測類別、Unknown／Ambiguous／Invalid、每類召回率、未知動作誤接受率、無動作時每分鐘誤觸發數、端點等待與總延遲。資料量小時報原始次數，不誇大百分比。

目標不是讓訓練樣本自己辨識自己達到 100%，而是測試新的示範及不應被接受的動作。未測得的準確率與效能請寫「未量測」。

## 18. Codex 實作里程碑

### M1：真實擷取與持久化

完成專案啟動、camera permission、模型資產、tracking、穩定 track、raw recording、命名與保存、重新整理讀回。用一個真實或可注入的原始序列走通 repository。

### M2：名稱查詢與 3D 重現

先把**已錄下的動作**透過搜尋名稱重播，完成程序化立體手與控制項。這是核心功能，不可推到只剩文件中的「未來功能」。

### M3：時序特徵與手動切段辨識

完成座標、品質、特徵、DTW、Unknown／Ambiguous、同名多樣本與辨識修正。用方向相反和順序相反測例防止靜態捷徑。

### M4：自動切段與雙手基礎

完成狀態機、預錄緩衝、防重複、雙手配對與同步播放，以及追蹤不確定時拒絕判定。提供清楚的環境限制。

### M5：校準、資料交換與完整驗收

完成 import/export、校準狀態、錯誤與資源清理、測試、介面、說明與第三方資產紀錄。

每個里程碑都執行相關檢查。順序是內部實作順序，不代表只完成 M1 就可宣稱整個任務完成。

## 19. 執行與完成條件

Codex 應在專案提供可執行 scripts，至少涵蓋：

```bash
npm install
npm run setup:assets
npm run dev
npm run typecheck
npm run lint
npm run test -- --run
npm run test:e2e
npm run build
```

若既有專案使用其他 package manager，沿用並在 README 提供等價命令，不混用 lockfile。端對端測試需要額外瀏覽器安裝或環境設定時，文件明示。

最終交付：可執行程式、lockfile、資產取得流程、README、架構與座標說明、測試、真人驗收清單、實際命令結果及已知限制。

- 不得只輸出計畫、UI mockup 或 pseudocode 即結束。
- 核心三功能不留 TODO／假資料 placeholder。
- 遇到相機、網路或 GPU 不能在開發環境使用，繼續完成可測試的核心、注入式 tracker 與明確的實機驗證路徑，並如實列出未驗證項。
- 不把未執行的測試寫成 passed，不把合成資料結果當成真人辨識率。
- 不覆寫使用者既有未提交變更；重大不相容改動先記錄理由，能沿用則沿用。

## 20. 延伸介面，但不增加第一版的依賴

保留以下可替換邊界：

- `TrackerProvider`：將來替換手部感知模型。
- `GestureRecognizer`：將來使用訓練過的 temporal encoder，但仍保存原始 motion。
- `GestureRepository`：將來同步到自建後端，而非改動核心資料合約。
- `HandRenderer`：程序化手替換為合法取得的綁骨模型。
- `SemanticAssistant`：將來描述動作或輔助名稱查詢，預設 disabled，不得阻擋三個核心流程。

若將來加入任何 VLM，明確規定用戶同意、原始影像取得方式及本機／外傳範圍。**不允許 VLM 根據文字猜出另一段動畫，取代使用者已教過的個人化示範。**

## 21. 官方／原始來源

以下來源用於核對工具能力、API 與限制；並不證明本專案的辨識率或任何參數已驗證。程式碼授權與資產授權請以實際採用版本再確認。

- [S1] MediaPipe Hand Landmarker overview：<https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker>
- [S2] MediaPipe Hand Landmarker Web guide（座標、VIDEO 模式、同步推論與 Worker）：<https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js>
- [S3] HandLandmarkerResult API：<https://ai.google.dev/edge/api/mediapipe/js/tasks-vision.handlandmarkerresult>
- [S4] HandLandmarker API（含時間戳 signature）：<https://ai.google.dev/edge/api/mediapipe/js/tasks-vision.handlandmarker>
- [S5] Three.js Quaternion：<https://threejs.org/docs/pages/Quaternion.html>
- [S6] Three.js GLTFLoader：<https://threejs.org/docs/pages/GLTFLoader.html>
- [S7] React Three Fiber introduction：<https://r3f.docs.pmnd.rs/getting-started/introduction>
- [S8] Dexie documentation：<https://dexie.org/docs/Dexie.js>
- [S9] tslearn DTW guide：<https://tslearn.readthedocs.io/en/stable/user_guide/dtw.html>
- [S10] tslearn DTW API：<https://tslearn.readthedocs.io/en/latest/gen_modules/metrics/tslearn.metrics.dtw.html>
- [S11] 1€ Filter 作者頁面：<https://gery.casiez.net/1euro/>
- [S12] MediaPipe repository license：<https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE>
- [S13] Three.js license：<https://github.com/mrdoob/three.js/blob/dev/LICENSE>
- [S14] Dexie license：<https://github.com/dexie/Dexie.js/blob/master/LICENSE>
- [S15] MDN getUserMedia：<https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia>
- [S16] MDN StorageManager.persist：<https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist>

參考資料查閱日期：2026-10-09。
