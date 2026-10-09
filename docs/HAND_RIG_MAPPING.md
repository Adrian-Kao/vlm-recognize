# hands.glb 骨架映射

本文件對應資產 SHA-256 `83b785d2df6c24c56fd07d967642d2e965cfebcd347205a5331152c9f410c221`。更換 GLB 後必須重新執行 `npm run inspect:hand -- public/models/hands.glb` 並重驗 mapping；檔名相同不代表相容。

## 實際 rig 拓撲

資產只有一個 SkinnedMesh 與一個 Skeleton，skin 有 46 joints。左右手都在同一 skin 中，各自擁有 wrist/root、palm 與五條四骨指鏈；另有兩個共用 root joint。每指第四骨是 terminal，MediaPipe tip 沒有下一段方向，因此只驅動前三骨，terminal 保留 rest rotation。

GLB 的 `31ee11bbbd9a49ac83a12a74f1fecac4.fbx` 匯入節點帶有實際 `0.01` uniform scale，且上層含 FBX→glTF 軸向轉換。執行時使用 mapping 固定的 `sceneScale = 7.5` 補償顯示尺度；這是整個 clone 的常數轉換，不是逐幀拉伸骨骼。未追蹤側會先把 scene-local 停放點 `[0, -8, 0]` 轉回該 root 的 parent-local 座標再移出鏡頭，避免 FBX 軸轉換把 local offset 帶往錯誤方向，也避免極大位移造成 GPU skinning 精度損失。

| MediaPipe | Left nodes | Right nodes | 驅動方式 |
|---|---|---|---|
| wrist / palm basis：0、5、9、17 | root 8、palm 9 | root 30、palm 31 | image wrist XY 驅動 root；world landmarks 掌部基底驅動 palm quaternion |
| thumb：1→2→3→4 | 10→11→12；13 terminal | 32→33→34；35 terminal | 獨立拇指鏈的三段方向，不套四指 Euler 預設 |
| index：5→6→7→8 | 14→15→16；17 terminal | 36→37→38；39 terminal | 每骨 local quaternion |
| middle：9→10→11→12 | 18→19→20；21 terminal | 40→41→42；43 terminal | 每骨 local quaternion |
| ring：13→14→15→16 | 22→23→24；25 terminal | 44→45→46；47 terminal | 每骨 local quaternion |
| pinky：17→18→19→20 | 26→27→28；29 terminal | 48→49→50；51 terminal | 每骨 local quaternion |

完整 node index、名稱與 path 存於 `public/models/hand.rig-map.json`，TypeScript 執行時映射位於 `src/core/rig/handRigMap.ts`。兩者皆綁定同一 asset hash。

## Retargeting 約定

1. `buildPlaybackClip` 從 rawFrames 建立局部手形與 image-plane root XY；全域 root Z 保持 0。
2. 每次套用姿態前都回復 GLB rest local position／quaternion／scale，因此直接 seek 與順播到同一 `tMs` 得到相同結果。
3. root bone 只作整手平移；palm bone 對齊 wrist→middle 與 pinky→index 建立的右手座標基底。
4. 指骨依父節點順序，將目前世界骨段方向最短旋轉至錄製骨段方向，再轉回 parent-local quaternion。每次最大修正 155°，避免退化估計造成反折。
5. 除 root 外不改寫 bone.position，不逐幀縮放、不重建 inverse bind matrices，所以來源骨長固定。
6. 資產的 `Idle` animation 不建立 AnimationMixer，也不參與重播。

## 左右手、clone 與單手顯示

資產原生包含左右手，因此不做負 scale 鏡像。每個 `ClipPlayer` 的每個觀測手都使用 `SkeletonUtils.clone` 複製完整 skinned hierarchy：雙手片段是兩個獨立 skeleton clone，在同一取樣時間分別驅動；不同預覽視窗也不會互相改骨。每個 clone 內未使用的另一側 root 會移出場景，不把它假稱為另一側。

## 已知限制

- MediaPipe 骨段方向無法唯一觀察沿指骨的 twist；目前採 rest-pose prior 與最短旋轉。
- 資產掌部比例與使用者手型不同時，MCP 表面位置可能不完全貼合 tracker 點位，但骨長不會被拉伸。
- 完全遮擋且沒有可靠前後端點時不補造指節動作。
- 映射、拇指對掌、左右手法線與穿模仍需真人攝影機依 `manual-camera-test.md` 驗收。
