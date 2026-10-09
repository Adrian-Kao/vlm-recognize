# vlm-recognize｜使用已下載 GLB 的手部重播與握拳辨識升級

> 給 Codex 的實作規格。請修改既有專案，不要另建只展示模型的 demo。
>
> 更新：2026-10-09。目標專案：`Adrian-Kao/vlm-recognize`。
>
> 本次指定資產：使用者剛下載的手部 GLB；約定放在 `public/models/hand.glb`。本文件撰寫時未取得 GLB 本體，**模型作者、授權、左右手、骨骼名稱、骨骼數及蒙皮是否完整均待實際檢查**。下載頁的 GLB／1K 選項不是上述資訊的證明。
>
> 本文件是開發要求，不是已完成的程式、模型驗證結果或辨識率報告。

## 0. 任務邊界與完成定義

保留使用者已完成的三個流程：

1. **新增動作**：錄製有時間順序的手部動作、輸入自訂名稱、保存多份示範。
2. **辨識動作**：再次示範，與個人記憶庫的完整時序比較；保留 Unknown／Ambiguous／Invalid。
3. **名稱 → 3D 重現**：搜尋名稱，讀出實際錄製的資料，驅動已下載 GLB 的手掌與手指。

本次交付必須同時包含「GLB 骨架驅動」及「握拳／短暫遮擋的辨識改善」。只讓模型出現在畫面，或只調低辨識門檻，都不算完成。

**外觀模型與辨識模型是不同層。** GLB 負責顯示；MediaPipe 與時序特徵負責估計、比對。換成好看的 GLB 不會直接增加攝影機可取得的資訊。對完全看不到、且沒有足夠前後文的手指，不得宣稱精確恢復其真實姿態。

本文件取代舊 `HAND_RIG_AND_OCCLUSION_UPGRADE.md` 中「另選模型、再下載模型」的流程。改成優先使用使用者已提供的 GLB。保留原有資料與隱私規則；舊版「程序化手是預設」改為「GLB 是預設、程序化手只作明示降級或除錯」。不要刪除整份 AGENTS.md 或 PROJECT_SPEC.md。

## 1. 先讀專案，再做增量修改

先執行 `git status --short`，讀取 `AGENTS.md`、`PROJECT_SPEC.md`、`README.md`、`package.json` 及 lockfile。保留未提交修改，不使用破壞性的 reset、clean、整個 src 重建或清除 IndexedDB。未經要求不要自行推送、部署或公開模型資產。

以下是先前檢視的程式位置；實作前以工作目錄的最新程式確認。這是靜態程式檢視，不代表已完成真人攝影機測試。

| 現有檔案 | 檢視到的設計 | 本次處理 |
|---|---|---|
| `src/rendering/ProceduralHand.tsx` | 方塊掌部、膠囊指節、球形關節 | 保留 fallback；新增 GLB SkinnedMesh 主渲染器 |
| `src/rendering/HandScene.tsx` | 直接渲染程序化手 | 共用 GLB 渲染器、載入狀態、除錯切換 |
| `src/core/playback/buildPlaybackClip.ts` | 將局部手形與 root XY 合成逐幀場景點 | 新增 retargeting 層，避免 root 或座標轉換重複套用 |
| `src/core/playback/samplePlaybackPose.ts` | 依時間取樣 | 加入可重現的骨架姿態取樣，保留 seek 與倍速 |
| `src/workers/tracking.worker.ts` | Hand Landmarker／VIDEO，輸出 landmarks 與 handedness | 保持背景執行，加入真實可取得的診斷 |
| `src/core/tracking/associateHands.ts` | 依手腕與左右手資訊關聯 track | 短缺口身分延續，雙手不確定時不得猜配 |
| `src/core/motion/quality.ts` | 完整追蹤與片段有效比例檢查 | 分開評估掌部、手指、時間覆蓋及身分可靠性 |
| `src/core/motion/segmenter.ts` | 追蹤中斷會取消片段；以運動能量起動 | 增加短缺口等待及獨立 static-hold 模式 |
| `src/core/motion/extractFeatures.ts` | localPose、rootXY、palmAxes | 增加形狀、關節角度與可靠性分支 |
| `src/core/recognition/dtw.ts`、`classify.ts` | 時序比對與未知拒絕 | 可靠性加權、低覆蓋拒絕、重新校準 |
| `src/core/types.ts`、`schemas.ts`、`storage/` | 原始序列、衍生模板與記憶庫 | 相容遷移，不覆寫 rawFrames |

優先沿用 React、TypeScript、Three.js、React Three Fiber、Drei、MediaPipe、Dexie、Vitest、Playwright。依 lockfile 查核 API，不要為這次任務任意升級所有套件。核心功能不依賴付費 API、雲端資料庫或大型 VLM。

## 2. 使用者資產放置方式

使用者將真正的 `.glb` 檔複製或重新命名為下列位置；若下載的是 ZIP，先取得 ZIP 中真正的 GLB，不能只將 ZIP 改副檔名。

```text
vlm-recognize/
├─ AGENTS.md
├─ PROJECT_SPEC.md
├─ CODEX_GLB_HAND_UPGRADE.md          ← 本文件
├─ public/
│  └─ models/
│     └─ hand.glb                    ← 使用者下載的真實模型
├─ src/
└─ package.json
```

`hand.glb` 是統一入口名稱，不是已確認的原始檔名。若工作目錄已經有唯一且明確的手部 GLB，先確認後引用或複製它，記錄原始位置；不要覆蓋不同內容的同名檔案。有多個候選且無法判斷時，列出候選請使用者選擇，不自行亂選。不要搜尋使用者未授權的磁碟或帳號。

工作目錄沒有 GLB 時，完成與資產無關的程式及測試，顯示「缺少 public/models/hand.glb」，保留既有降級重播；將真實模型映射與驗收列為受阻項目。**不能建立空 GLB、用測試模型冒充使用者模型，或宣稱已完成 GLB 整合。**

## 3. P0：實際檢查 GLB，產生可追溯報告

### 3.1 新增資產檢查工具

建立 `scripts/inspect-hand-glb.mjs` 或等價工具，提供例如：

```bash
npm run inspect:hand -- public/models/hand.glb
```

這是本次應新增的命令，不是假設目前已存在。檢查分成兩層：可重複執行的檔案結構檢查，以及透過 GLTFLoader 的瀏覽器載入／蒙皮驗證。僅解析 JSON chunk 不等於已驗證壓縮資產或皮膚變形。GLB／skin 結構依 [S7] 檢查。

| 檢查類別 | 必須記錄／驗證 |
|---|---|
| 檔案 | 真實路徑、位元組數、SHA-256、GLB magic/version、宣告與實際長度 |
| 場景 | scene、節點階層、重複／空節點名稱、mesh 數與 skin 關聯 |
| 骨架 | 每個 skin 的 joint 節點、根節點、父子關係、bind/rest transform |
| 蒙皮 | mesh 是否引用 skin；JOINTS_0／WEIGHTS_0 的 accessor、索引範圍與權重有效性 |
| 綁定矩陣 | 檢查存在的 inverseBindMatrices；缺省時依 glTF 規範處理，不能直接判為損壞 |
| 材質 | 材質／貼圖是否正常；外部 URI、紋理解析度與遺失資源 |
| 擴充 | extensionsUsed／extensionsRequired，是否需 Draco、Meshopt 或 KTX2 解碼器 |
| 動畫 | 動畫清單、作用節點；沒有動畫不代表沒有可驅動骨架 |
| 手部類型 | 單手或雙手、候選左右手、是否含前臂；不能只憑檔名認定 |

將結果寫入 `docs/HAND_ASSET_REPORT.md`。在瀏覽器遍歷 `SkinnedMesh.skeleton.bones`，實際確認旋轉一個手指骨骼會帶動對應表面。Three.js 的相關載入與蒙皮 API 參照 [S1]、[S2]。

### 3.2 明確的資產狀態

至少區分 `missing`、`invalid-file`、`unsupported-extension`、`mesh-only`、`rig-unmapped`、`rig-ready`。另以獨立欄位記錄授權狀態，不將「可以載入」等同於「可以公開分發」。

若只有靜態 Mesh，沒有有效 skin／骨架，不可把轉動整個模型當作手指重現。提供具體的重新匯出／補 rig 路徑；如需人工處理，明示受阻原因，先保持原系統可用。不自動購買、另找來路不明資產或登入下載網站。

### 3.3 資產來源與版本

建立 `public/models/hand.asset.json`，保存實際 SHA-256、原始檔名、模型標題、作者、來源、授權、取得日期及修改紀錄。未知值使用 null／unverified，不填捏造的作者或授權。從實際下載頁或附帶授權檔確認後，再更新 THIRD_PARTY_NOTICES.md；未確認可分發前不自動把二進位模型提交或部署到公開網站。

將 rig-map 與資產 hash 綁定。之後換成另一個 GLB 或 4K 版本也必須重驗證骨架與 mapping，不能只看副檔名便假設相容。

## 4. P1：GLB 成為主要手部渲染器

### 4.1 載入與快取

使用專案版本支援的 GLTFLoader／useGLTF；正式資產從本機站點載入，不依賴外部展示網站。以 Vite 的 base 設定解析 URL，避免子路徑部署失效。404 即使返回 HTTP 200 的 SPA HTML，也應被辨識為錯誤資產。[S1]

只在 GLB 實際需要時加入對應解碼器，且維持本機可提供的資產路徑。新增解碼器前核對版本、體積及授權，不預設所有 GLB 都需要 Draco。

提供 Suspense/loading 與 ErrorBoundary/error；失敗時顯示原因並回退，不得黑畫面或無限載入。正常預設顯示 GLB；程序化手只在明示降級或使用者選擇除錯時顯示。

### 4.2 骨架實例必須獨立

每隻手、每個同時存在的預覽視窗，都要有自己的骨架。使用 SkeletonUtils.clone 複製包含骨骼的共同場景祖先，不使用一般 clone 後共用骨骼，也不直接修改 useGLTF 快取中的原始 scene。[S3]

幾何及不變材質可合理共用；若要調整某隻手的透明度／顏色，先處理材質所有權。卸載時不要 dispose 其他視窗仍使用的快取幾何與貼圖。禁止每幀重新載入模型、建立全部幾何或重新綁定 skeleton。

### 4.3 建議新增模組

```text
scripts/inspect-hand-glb.mjs
src/rendering/RiggedHand.tsx
src/rendering/HandAssetBoundary.tsx
src/rendering/HandRigInspector.tsx
src/core/rig/rigTypes.ts
src/core/rig/inspectRig.ts
src/core/rig/resolveRigMap.ts
src/core/rig/retargetHandPose.ts
src/core/rig/buildRigPlaybackClip.ts
src/core/tracking/estimateReliability.ts
public/models/hand.asset.json             # 依真實檔案產生
public/models/hand.rig-map.json           # 依真實骨架產生
```

名稱可依現有結構調整，避免重複功能。資料處理與 retargeting 應能脫離攝影機／React 單元測試。原錄製預覽與名稱查詢重播都必須接上同一套渲染路徑，不只修改其中一頁。

## 5. 21 個關鍵點 → 真實骨架映射

### 5.1 不預設「21 landmarks = 21 bones」

MediaPipe 的手部點位分組如下；其輸出與座標說明見 [S4]。

| 區域 | landmark indices | 映射注意事項 |
|---|---|---|
| 手腕 | 0 | 場景 root 與掌部方向的參考，不保證等於來源 armature root |
| 拇指 | 1、2、3、4 | CMC／MCP／IP／tip；必須處理獨立的對掌與彎曲方向 |
| 食指 | 5、6、7、8 | MCP／PIP／DIP／tip |
| 中指 | 9、10、11、12 | MCP／PIP／DIP／tip |
| 無名指 | 13、14、15、16 | MCP／PIP／DIP／tip |
| 小指 | 17、18、19、20 | MCP／PIP／DIP／tip |

tip 可能沒有對應骨骼；來源 rig 可能多出 metacarpal、twist、helper、forearm。0 到各 MCP 的連線也不能直接當成來源 rig 的每一根變形骨。

建立 `hand.rig-map.json`：含 `assetSha256`、`rigVersion`、資產手側、root、掌部參考、五指骨鏈、rest basis、旋轉 offset、關節軸與限制，以及映射狀態。使用唯一節點路徑或穩定索引定位，不能只靠可能重複的名稱。

骨名匹配只能產生候選。必須以階層、bind pose 方向及單指驅動驗證，不能假定有 `mixamorig:LeftHandIndex1` 等特定名稱。資訊不足時保留未映射狀態並提供 inspector，不能產生看似完成的假 mapping。

### 5.2 座標與 root 只能套用一次

既有 `buildPlaybackClip.ts` 已產生包含 root 位移的場景 joints。整合時選定一條清楚的資料路徑：

```text
MotionSample.rawFrames（不改寫）
  → 時間對齊／品質資料（derived）
  → 局部手形 + rootXY + 手側（canonical pose）
  → 受限 retargeting
  → root transform + 每骨骼 local quaternion
  → GLB SkinnedMesh
```

可以沿用既有 PlaybackHandPose.joints，再以 joints[0] 分離 root 與相對座標；也可從 rawFrames 建 canonical pose。但不可同時把兩條路徑的 root／scale 疊加。

現有 provider-to-scene 為 `(x, -y, -z)`；確認來源與 scene 的實際約定後只轉換一次。自拍鏡像只改顯示，不改寫 rawFrames、左右手身分或辨識方向。

MediaPipe 的 world landmarks 不是整隻手的攝影機全域平移。本版保留 root XY，展示 root Z 維持既有假設，不用局部指尖 z 猜整隻手的前後距離。[S4]

### 5.3 保留 bind/rest pose，不直接拉動頂點或骨頭位置

匯入後記錄原始 bind/rest 的局部 transform、掌部基底及骨骼長度。不要將來源 asset 的 rest pose 一律當成張掌，也不要把 GLB 第一個動畫的第一幀視為零旋轉。

對每根映射骨骼計算目標方向／旋轉，再轉至**當前父節點座標系**；父節點可能是其他 Bone 或具有旋轉的 Object3D。對純旋轉部分應滿足：

```text
Q_local_target = inverse(Q_parent_world) × Q_bone_world_target
```

`Q_bone_world_target` 必須包含來源 rig 的 rest-axis／offset 校準；不能把上式誤用成所有模型的完整通用 retargeting。遇到非均勻 scale 或 reflection，先整理對應矩陣與座標空間，不直接當作純 quaternion 處理。

骨骼局部平移與長度保持來源 rig 的值，手部整體 scale 在初始化／校準後固定。禁止逐幀把 MediaPipe 世界座標寫入 bone.position，或每幀 calculateInverses／重新 bind，造成手指伸縮或蒙皮破裂。

每根手指分開處理彎曲、外展與來源 rig 的軸向。拇指對掌獨立處理，不用四指同一套 Euler 規則硬套。只從骨段方向無法唯一決定的軸向扭轉，使用有記錄的 rest prior／時間連續性，不冒充精確量測。

加入可配置的關節軟限制、退化向量防護與低品質處理。限制基於模型測試調整，不把固定角度宣稱為所有使用者的生理真值。需改善明顯手指反折、拉長與穿掌；若來源蒙皮或估計限制仍造成碰撞，報告限制，不宣稱光靠 clamp 就完全消除穿模。

### 5.4 左右手與雙手

先確認 GLB 含哪一側。兩套資產存在時分別映射；只有一套時，建立經驗證的手側轉換，或在授權允許且工具可用時產生保留原檔的左右手衍生資產。

不把「複製右手」直接標成左手。若採 reflection，必須在一致的 rig 局部空間處理，驗證負行列式、蒙皮、法線、拇指位置及掌部方向；不能只翻骨骼 quaternion 某個分量，也不能把整個世界移動軌跡一起鏡像。

兩手必須獨立 clone、獨立映射／更新並保留共同時間軸。無法正確支援另一手側時，明示該手側回退，保留功能；不可宣稱雙手 GLB 驗收成功。

### 5.5 播放必須可重現

已錄製片段建議預先生成 derived rig poses，依原始時間戳插值；位置用線性插值、旋轉用正規化 quaternion 的最短路徑 slerp。平滑只作用於 derived data，不覆蓋 rawFrames。

同一 sample 在同一 tMs 的姿態，必須不依賴先前播放路徑。從頭播放到 t、直接拖到 t、倒拖再回 t，都應在容許誤差內相同。不要只在 render loop 用有記憶的 slerp，導致暫停還繼續彎曲、seek 結果不一致或倍速改變姿態。

即時預覽可以使用獨立的因果平滑；離線重播則使用確定性的預處理。loop、換樣本、seek 與手側切換要重設相關狀態。重播包含缺口時按第 6 節標示，不自動播放 GLB 內建握拳動畫替代錄製內容。

使用 useFrame／refs 更新骨骼，避免每幀 React setState 造成全樹重繪。保留播放／暫停、0.25–2×、拖曳、循環、正／側／背面與手腕軌跡。

## 6. P2：握拳與短暫遮擋的辨識改善

### 6.1 先分辨失敗在哪一層

UI 加入可展開的診斷，不需要所有資訊都擠在主畫面：

| 分層狀態 | 說明 |
|---|---|
| `no-hand` | 整隻手未偵測到或已失去追蹤 |
| `unstable-pose` | 有輸出點位，但幾何／時間連續性不穩 |
| `segment-not-triggered` | 未形成完整片段或 static-hold 尚未滿足 |
| `low-coverage` | 足以展示某些部分，但不足以可靠辨識 |
| `unknown / ambiguous` | 已可比對，但與記憶不近或候選太接近 |
| `rig-error` | 姿態已有，GLB／映射／蒙皮出問題；不是分類器錯誤 |

記錄追蹤 FPS、時間缺口、片段長度、掌部可用比例、特徵有效比例、候選距離與門檻版本。不要把握拳所有失敗都歸因於「沒看到五根手指」。

### 6.2 模型估計與補值分開

檢查實際使用版本的 MediaPipe 回傳型別。Handedness score 是左右手分類分數，不是每個指尖的位置信心。不因通用 Landmark 型別存在某欄位，就假設 Hand Landmarker 真的提供有意義的逐點 visibility。[S4]

由骨長變化、速度尖峰、掌部基底退化、track 身分與連續性建立 heuristic reliability，明確標為「衍生可靠性」，不是模型提供的真實機率。不能因為擬合後手看起來平滑，就提高原始點位的可靠性。

概念上分開記錄：

```ts
type PoseEvidence =
  | 'model-estimate'    // 追蹤器本次有輸出，不代表所有關節肉眼可見
  | 'interpolated'      // 前後均有可靠輸出時的離線短缺口插值
  | 'predicted'         // 即時短時間外推／保持
  | 'missing';
```

這是新資料設計，不要在缺少來源時偽造值。rawFrames 只保留追蹤器實際輸出的資訊與缺幀；補值、可靠性、平滑及 rig poses 都屬 derived data。

### 6.3 短缺口政策必須一致

建立共用 gap policy，供 association、segmenter、quality、feature extraction、replay 使用。不要某層允許 250ms，下一層又無提示地拒絕 150ms，造成看似通過卻不能儲存。

可先用 **150ms 作為可配置的短缺口起始值**；這是工程測試起點，不是驗證過的最佳門檻。

在錄製／自動切段時，單一短缺口不立即清除整段資料。進入例如 `TRACKING_PENDING`，保留原始時間軸與 track；恢復後重新確認身分。缺口期間不要累加「穩定握拳」時間，也不要用它觸發動作完成。

即時只能使用目前與過去資料做有界保持／預測；離線插值必須有前後可靠端點，且不可跨不同 track 或左右手。補出的影格不能計入真實追蹤覆蓋率。

超過上限、雙手配對仍不確定或關鍵姿態變化剛好被遮住，回報 Invalid／Ambiguous，不猜測已發生的動作。展示可暫時保持最後姿態並顯示「追蹤暫失」，但不得將保持畫面當成成功辨識。

### 6.4 品質檢查不以全部指尖為單一門檻

將品質拆為掌部、各手指、時間覆蓋、手部身分和整段可辨識度。短暫單一指尖估計出界不必把整隻手一律作廢，但掌部出框、退化幾何、長缺口及不確定雙手配對仍要拒絕。

本次不要求刪除所有品質門檻，也不要求直接將 90% 改為很低的值。保留足夠的原始掌部追蹤與特徵覆蓋要求；以獨立驗收資料設定。`estimatedJointCount === 21` 是輸出結構條件，不是「21 點都可見且準確」的證明。

持續合理但錯誤的遮擋關節估計，不一定能靠平滑與 heuristic 發現。這類情況保留限制與拒絕機制，不做無依據的信心保證。

### 6.5 新增手形分支，保留完整時序

保留原本的相對 landmarks 分支，新增按手掌尺度正規化的關節彎曲角、指尖到 MCP／掌心距離、拇指相對位置、張合程度等。掌部局部手形與相機相對掌部方向分開表達，不能為了消除視角影響而刪掉原本有語意的手掌旋轉。

特徵至少分為 `shape`、`localPose`、`rootXY`、`palmOrientation`、雙手 `interHand`。不同分支有明確尺度、權重及可靠性；一個指尖的漂移不應壓倒所有可用掌部資訊。手指彎曲特徵仍來自估計點，不是另一個可看穿遮擋的感測器。

使用可靠性加權 DTW，概念如下：

```text
pairWeight[k] = featureWeight[k] × reliabilityA[k] × reliabilityB[k]
localCost = Σ(pairWeight[k] × error[k]) / Σ(pairWeight[k])
```

上式只能在共同有效資訊達到門檻時使用。分母太小或只剩無辨識力的手腕位置時，必須標記不可比對；不能用 epsilon 把「都不知道」變成零距離。增加缺失比例限制／懲罰，重新校準最終距離，保留 Unknown 與候選差距判定。

仍用有界時序對齊；不可把整段平均、排序影格或自動與反向序列取最小距離。測試開掌→握拳與握拳→開掌、左滑與右滑、順時針與逆時針；也要測試握拳後移動與移動後握拳。

同類速度變化用時序對齊處理。若加入速度特徵，必須說明使用真實時間或 phase 正規化，避免反而把快慢版本分成不同類。幅度／方向／左右手規則由明確政策控制，不為了提高測試分數任意消去。

先保留 `match-recording` 左右手政策；Unknown handedness 可暫緩決策並等待穩定 track，不能直接當成任一手。跨手側泛化屬可選政策，啟用時需獨立測試，不能把場景左右方向一併鏡像。

### 6.6 靜態握拳是附加模式，不取代動態學習

在既有動態流程之外，新增獨立 `static-hold` 選项，並在動作 metadata 區分 `dynamic` 與 `static-hold`。舊資料預設 `dynamic`，不自動推測或改寫類型。

`static-hold` 仍由使用者錄一段穩定姿態、輸入名稱、保存真實片段及重播。使用者已經握拳、手腕不動時，也能在足夠可靠的穩定觀測後觸發一次。

穩定時間可先以 600ms 作可配置起始值，追蹤缺口不算穩定觀測。需有 release／姿態改變後重新武裝，不能每隔 cooldown 一直重複觸發同一個握拳。預設以分開模式避免動態片段中的短暫握拳提前觸發。

動態資料使用時序比對；靜態資料使用相容的穩定姿態視窗及獨立校準。變更某動作類型時重建 derived templates，不得直接把靜態 query 比對所有動態模板。

## 7. 可選擴充，不得阻擋本次核心交付

Google Gesture Recognizer 有 `Closed_Fist`、`Open_Palm` 等既定類別，可作靜態輔助或比較基準；它不會取代個人名稱與連續動作，也不是獨立於手部偵測／landmarks 的遮擋修復器。[S5]

若引入它，先評估用單一 provider 回傳所需資訊，避免每幀跑兩套完整追蹤造成延遲。保留本機資產、Worker 與版本來源；不將 canned label 當成使用者已教過的動作。

更進階的 `RGB crop → image encoder → temporal fusion` 僅列為後續實驗。沒有合適且授權可用的預訓練權重／驗收資料時，不建立假 inference、隨機 embedding 或空 API 冒充。ONNX Runtime Web 是可用的瀏覽器推論選項，但不是現成握拳辨識權重。[S6]

預設不保存、不上傳 RGB、不增加麥克風或雲端需求。需要研究資料時另做明確 opt-in、保存期限與刪除控制。

## 8. 資料相容、版本與隱私

保存既有 gestureId、名稱、aliases、representativeSampleId、trim、rawFrames 與完整 timestamps。不要為了換 GLB 要求使用者重錄所有動作。

純粹更換外觀只更新 `assetSha256`／`rigVersion`／`retargetVersion` 及重播快取，不應改寫辨識記憶。這次辨識特徵亦有升級，另提升 feature／preprocessing／qualityPolicy 版本，從 rawFrames 重建模板，並將舊校準標為 stale；不沿用原距離門檻宣稱已驗證。

如需新欄位，新增可相容的 schema／Dexie 遷移。舊匯出資料可匯入，缺省值要明確；新版本匯出帶 manifest/version。遷移用可重試交易或版本化衍生表，失敗不能毀損原資料。建立一份真實結構的 v1 測試資料驗證升級、失敗回退與再次執行。

GLB 不塞入每個 MotionSample 或每份 JSON 匯出；共用模型由資產系統處理。預測片段仍須使用者確認才能追加；展示用的補值不得被改寫成原始觀測樣本。

## 9. 介面要求

保留繁體中文的「新增動作」「辨識動作」「3D 重現」。不全面重做視覺設計。

在錄製預覽與重播頁加入三種可切換視圖：**GLB 手部**、**原始估計點／骨架**、**擬合骨架**。清楚區分 tracker 估計與 rig 擬合，不將 raw 估計標成 ground truth。

進階面板提供模型檢查結果、mapping 狀態、手側、root 軌跡、低可靠性／補值時間區段及效能資訊。診斷測試姿態放在獨立 inspector，標「測試姿態，非已錄製資料」，不能出現在使用者動作庫中冒充示範。

新模型載入失敗時顯示具體訊息，例如「模型沒有可用骨架，目前使用程序化降級顯示」。辨識可以繼續，不將 GLB error 誤報為 Unknown gesture。

## 10. 實作階段與每階段交付

| 階段 | 必須實作 | 階段完成證據 |
|---|---|---|
| P0：檢查與診斷 | 保護現況、GLB 檢查工具、資產報告、分層失敗訊號 | 真實檔案報告；不存在則真實受阻說明 |
| P1：GLB 驅動 | 映射、局部旋轉、拇指、手側、獨立骨架、預覽／重播、seek | 單指與開掌／握拳實際蒙皮畫面、取樣測試 |
| P2：辨識可靠性 | 短缺口、手形分支、可靠性 DTW、static-hold、版本遷移 | 新舊測試、拒絕機制測試、資料回歸 |
| P3：真人驗收 | 獨立示範、未知負例、效能與失敗分層計量 | 實際次數及結果，不能用合成資料替代 |

P0–P2 是本次必要程式範圍。P3 在環境不能用真人攝影機時交付明確驗收步驟，並保留「尚未驗證」。第 7 節的 RGB／VLM 擴充不屬本次必要交付。

遇到資產問題不要只寫 TODO 就停止全部工作；完成可獨立的部分並明列剩餘阻礙。但不能以 fallback 正常運作宣稱真實 GLB 驗收完成。

## 11. 測試與驗收矩陣

### 11.1 自動化測試

| 編號 | 測試 | 要求 |
|---|---|---|
| A01 | 缺檔、HTML 冒充 GLB、損壞 GLB | 明確失敗與降級，無黑畫面 |
| A02 | 靜態 Mesh／缺 skin／缺指鏈 | 正確標記，不能把載入成功當 rig-ready |
| A03 | 真實資產及 mapping hash | 不同 asset 不沿用舊 mapping；測試記錄實際 SHA |
| A04 | clone 獨立性 | 改一隻手的骨骼不影響另一手或其他預覽 |
| A05 | rest→target、父座標轉換 | 不重複套用根旋轉；零變化姿態不飄移 |
| A06 | 單指、拇指、握拳→張開 | 對應表面跟隨，骨長不被逐幀改寫 |
| A07 | 左／右手與鏡像預覽 | 拇指位置、手側、軌跡正確，開關不改 rawFrames |
| A08 | seek／暫停／倍速／loop | 同 tMs 同姿態；暫停不再變形，時長保持 |
| A09 | 短缺口與長缺口 | 上限前等待／標記；超限拒絕；不跨 track 插值 |
| A10 | 幾乎全未知的特徵 | 不能因低權重而得到零距離並誤接受 |
| A11 | 反向順序與方向 | 張掌→握拳 ≠ 握拳→張掌；左滑 ≠ 右滑 |
| A12 | 快慢、抖動、局部劣化 | 同類容許變化；評估同時保留未知拒絕 |
| A13 | static-hold | 穩定保持可觸發一次，缺口不計時，未釋放不重觸發 |
| A14 | 資料遷移／匯出入／改名 | 原始序列不變、重播仍可用、模板版本正確 |
| A15 | 模型錯誤與分類解耦 | GLB 失敗不阻斷新增／辨識，不顯示假成功 |
| A16 | 不確定雙手身分 | 不交換兩手軌跡、不猜出另一個動作 |

測試中可使用明確標示的合成 landmarks 及測試用最小 rig，但不能把它們放成使用者的 `public/models/hand.glb`。真實資產整合測試若缺檔要列為 blocked／skipped，不能被總結成全部驗收通過。

實際執行現有與新增命令：

```bash
npm run inspect:hand -- public/models/hand.glb
npm run typecheck
npm run lint
npm run test -- --run
npm run test:e2e
npm run build
```

先確認腳本與依賴可用；記錄命令、退出結果、失敗原因。資產檢查命令需先實作。對網路、瀏覽器或權限受限的測試明示限制，不編造執行紀錄。

### 11.2 真人攝影機驗收

每類先錄不同速度與自然角度的少量示範，再用**沒有加入模板的獨立新示範**測試。最低情境：穩定握拳、張掌→握拳、握拳→張掌、指向、拇指食指捏合、手掌轉向、握拳後左右移動、短暫自遮擋、未知動作與無動作。

雙手另測不同動作並行與交叉遮擋；不把配對不確定藏起來。對「握拳」分別記錄是否有 hand detection、是否切段、是否品質拒絕、最終分類，才能看出改善來源。

報告原始分子／分母、每類 precision／recall、Unknown／Ambiguous／Invalid 次數、未知誤接受、無動作每分鐘誤觸發、追蹤 FPS 與端到端延遲。召回率分母必須包含失敗／拒絕的有效測試次數，不能只算系統願意回答的樣本。

同一段評估資料比較舊版與新版；不要讓訓練模板自己比自己。保存新舊版本、權重／門檻、設備／解析度與光線紀錄。沒有真人測試時不填任何估計準確率。

## 12. 最終交付內容

完成後回報修改檔案與功能、真實 GLB 檢查結果／hash、映射方式與左右手支援、安裝啟動方式、測試命令結果、舊資料相容性，以及仍需人工或攝影機驗證的項目。

更新 `docs/HAND_ASSET_REPORT.md`、`docs/HAND_RIG_MAPPING.md`、`docs/manual-camera-test.md`、README 與 THIRD_PARTY_NOTICES。授權未確認、資產未提供、骨架不完整或真人效果未驗證都要列明，不以模糊的「已完成優化」帶過。

如果更新 AGENTS.md，只補入本次任務摘要與本文件路徑，不把整份長規格覆蓋成 AGENTS.md。Codex 的專案指引讀取方式參照 [S8]；本任務仍需明確讀取本文件。

## 13. 可直接貼給 Codex 的啟動提示詞

```text
請先閱讀 AGENTS.md、PROJECT_SPEC.md、README.md 及
CODEX_GLB_HAND_UPGRADE.md，然後直接修改現有 vlm-recognize 專案，
保留未提交變更，不要重建成新的 demo。

本次使用我已下載的手部 GLB，預期位置是 public/models/hand.glb。
先檢查工作目錄中的真實檔案、skin、骨架、蒙皮權重、手側與授權資料，
產生 HAND_ASSET_REPORT。不要假設骨骼名稱，也不要再自行挑別的模型。

依文件完成 P0–P2：
1. 以 GLB SkinnedMesh 取代預設程序化手，根據保存的連續 landmarks
   驅動真實骨架，完成拇指、各指節、手掌朝向、root 位移與手側映射。
   使用獨立 skeleton，保留 bind/rest pose 與固定骨長。
2. 錄製預覽與名稱查詢重播都接上同一渲染器，保留播放、暫停、seek、
   倍速、循環與除錯骨架。同一時間點必須得到一致姿態。
3. 改善握拳／部分遮擋：加入分層診斷、共用短缺口政策、衍生可靠性、
   手指彎曲與形狀特徵、可靠性加權 DTW、未知拒絕，以及 static-hold。
   不能只降低門檻，不能把沒有資訊的特徵算成完美匹配。
4. 保留新增動作、辨識連續動作、依名稱重現三個流程，以及所有舊資料。
   升級衍生特徵版本並讓舊校準失效，不覆寫 rawFrames。

禁止播放 GLB 預製握拳動畫冒充使用者錄製；禁止只旋轉整隻模型冒充
手指動作；禁止用 Google 固定手勢名稱取代我自訂的動作記憶。
不捏造 MediaPipe 逐指尖信心、不把 handedness score 當關節可信度，
也不宣稱 GLB 能修復所有遮擋。

若 GLB 缺少或沒有可用 rig，清楚說明，完成可獨立的工作並保留明示
fallback；不得用假資產或合成資料宣稱真實模型整合成功。

實際執行資產檢查、typecheck、lint、單元／整合測試、e2e 和 build，
交付修改內容、骨架映射、測試結果與真人攝影機尚需驗證的項目。
不要只交分析或 TODO，不要自行推送、部署或公開授權未確認的模型。
```

## 14. 技術參考與查核範圍

以下為官方 API／格式參考；實作時仍以專案 lockfile 對應的版本確認。文中的模組分工、缺口政策、特徵設計與驗收項目是本次工程要求，不是來源提供的準確率保證。

- **[S1] Three.js GLTFLoader**：`https://threejs.org/docs/pages/GLTFLoader.html`
- **[S2] Three.js SkinnedMesh**：`https://threejs.org/docs/pages/SkinnedMesh.html`
- **[S3] Three.js SkeletonUtils.clone**：`https://threejs.org/docs/pages/module-SkeletonUtils.html`
- **[S4] Google Hand Landmarker — Web**：`https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js`
- **[S5] Google Gesture Recognizer**：`https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer`
- **[S6] ONNX Runtime Web**：`https://onnxruntime.ai/docs/tutorials/web/`
- **[S7] Khronos glTF 2.0 specification**：`https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html`
- **[S8] Codex AGENTS.md**：`https://developers.openai.com/codex/agent-configuration/agents-md`

專案檢視依據：本次讀取的 `src/rendering/ProceduralHand.tsx`、`src/core/motion/segmenter.ts`、`src/core/motion/quality.ts`，以及前次檢視的座標、追蹤、時序、播放及資料儲存模組；其餘細節由 Codex 在最新工作目錄再確認。本次未讀取或驗證使用者 GLB 本體。
