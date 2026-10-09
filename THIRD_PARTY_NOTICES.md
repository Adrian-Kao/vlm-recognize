# Third-party notices

實際安裝版本由 `package-lock.json` 鎖定。以下資料由安裝套件的 `package.json` 核對：

| Package / asset | Version | License | Source / use |
|---|---:|---|---|
| `@mediapipe/tasks-vision` | 1.1.0 | Apache-2.0 | MediaPipe Web Tasks API and matching WASM |
| Hand Landmarker float16 task bundle v1 | v1, SHA-256 `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1` | Google 官方下載頁未在檔案端點單獨宣告授權；不提交至本 repository | `storage.googleapis.com/mediapipe-models/.../hand_landmarker.task`, downloaded by `setup:assets` |
| Free Pack - VR Hands (Rigged), `hands.glb` | SHA-256 `83b785d2df6c24c56fd07d967642d2e965cfebcd347205a5331152c9f410c221` | CC-BY-4.0（依 GLB 內嵌 metadata；發佈前仍應核對來源頁） | PolyOne Studio, [Sketchfab source](https://sketchfab.com/3d-models/free-pack-vr-hands-rigged-b3b8309e59c748e3956531c8f57dd233). Used as the local rigged left/right hand renderer. |
| `three` | 0.186.1 | MIT | 3D primitives and math |
| `@react-three/fiber` | 9.8.1 | MIT | React renderer for Three.js |
| `@react-three/drei` | 10.7.9 | MIT | OrbitControls, Grid, Line |
| `dexie` | 4.4.6 | Apache-2.0 | IndexedDB wrapper; Dexie Cloud is not used |
| `react`, `react-dom` | 19.3.0 | MIT | UI runtime |
| `zod` | 4.6.5 | MIT | Import schema validation |
| Vite / Vitest | 8.3.4 / 5.0.3 | MIT | Build and unit/integration tests |
| Playwright | 1.64.0 | Apache-2.0 | Browser end-to-end tests |

`hands.glb` 的內嵌 metadata 指定作者為 PolyOne Studio、授權為 CC-BY-4.0；應用程式保留原始二進位與貼圖，不播放其 `Idle` 動畫來冒充錄製內容。沒有外部字型或複製的 1€ Filter 程式碼。程序化手幾何仍由本專案原始碼建立，僅作降級與診斷。

模型能力與下載來源：[Google AI Edge Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker)。如果部署者需要重新散布模型檔，應另外確認該模型版本當時適用的 Google 條款；本 repository 的預設流程由使用者在安裝時從官方端點取得。
