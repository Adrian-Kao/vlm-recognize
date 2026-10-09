# HAND_ASSET_REPORT

由 `npm run inspect:hand -- public/models/hands.glb` 產生。報告只描述實際檔案；瀏覽器載入與動態蒙皮另由 E2E 驗證。

## 檔案與狀態

- 狀態：**rig-ready**
- 路徑：`C:\GitHub\vlm-recognize\public\models\hands.glb`
- 大小：596856 bytes
- SHA-256：`83b785d2df6c24c56fd07d967642d2e965cfebcd347205a5331152c9f410c221`
- GLB：magic `glTF`、version 2、宣告與實際長度一致
- glTF generator：Sketchfab-0.8.0
- extensionsUsed：KHR_materials_specular
- extensionsRequired：無

## 資產內嵌來源資料

- 標題：Free Pack - VR Hands (Rigged)
- 作者：PolyOne Studio (https://sketchfab.com/polyone)
- 來源：https://sketchfab.com/3d-models/free-pack-vr-hands-rigged-b3b8309e59c748e3956531c8f57dd233
- 授權：CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)
- 授權狀態：**metadata-declared**（來自 GLB 內嵌 metadata，發佈前仍應保留署名並核對來源頁）

## 場景、手側與動畫

- scene：1；nodes：53；meshes：1；skins：1
- 手側候選：**both**（依節點名稱與兩條完整階層判定）
- 動畫：Idle (44 channels；targets: J_Left_HandThumb4_07, J_Left_HandThumb3_06, J_Left_HandThumb2_05, J_Left_HandThumb1_04, J_Left_HandIndex4_011, J_Left_HandIndex3_010, J_Left_HandIndex2_09, J_Left_HandIndex1_08, J_Left_HandMiddle4_015, J_Left_HandMiddle3_014, J_Left_HandMiddle2_013, J_Left_HandMiddle1_012, J_Left_HandRing4_018, J_Left_HandRing3_00, J_Left_HandRing2_017, J_Left_HandRing1_016, J_Left_HandPinky4_022, J_Left_HandPinky3_021, J_Left_HandPinky2_020, J_Left_HandPinky1_019, J_Left_Hand_03, J_Left_02, J_Right_HandThumb4_028, J_Right_HandThumb3_027, J_Right_HandThumb2_026, J_Right_HandThumb1_025, J_Right_HandIndex4_032, J_Right_HandIndex3_031, J_Right_HandIndex2_030, J_Right_HandIndex1_029, J_Right_HandMiddle4_036, J_Right_HandMiddle3_035, J_Right_HandMiddle2_034, J_Right_HandMiddle1_033, J_Right_HandRing4_040, J_Right_HandRing3_039, J_Right_HandRing2_038, J_Right_HandRing1_037, J_Right_HandPinky4_044, J_Right_HandPinky3_043, J_Right_HandPinky2_042, J_Right_HandPinky1_041, J_Right_Hand_024, J_Right_023)。應用程式不播放資產動畫；姿態只由錄製 landmarks 驅動。
- 節點名稱：空白 0 個；重複 無。
- 材質：1（VR_Hands_M）；images：1；外部 URI：無

| image | 名稱 | MIME | 內嵌 | bytes | 尺寸 | URI |
|---:|---|---|---|---:|---|---|
| 0 | — | image/png | 是 | 344889 | 1024×1024 | — |

## Skeleton 上層座標轉換

| node | 名稱 | matrix | translation | rotation | scale |
|---:|---|---|---|---|---|
| 0 | Sketchfab_model | 1, 0, 0, 0, 0, 2.220446049250313e-16, -1, 0, 0, 1, 2.220446049250313e-16, 0, 0, 0, 0, 1 | — | — | — |
| 1 | 31ee11bbbd9a49ac83a12a74f1fecac4.fbx | 0.009999999776482582, 0, 0, 0, 0, 0, 0.009999999776482582, 0, 0, -0.009999999776482582, 0, 0, 0, 0, 0, 1 | — | — | — |
| 2 | Object_2 | — | — | — | — |
| 3 | RootNode | — | — | — | — |
| 4 | Object_4 | — | — | — | — |
| 5 | _rootJoint | — | — | — | — |

- FBX 匯入節點的 matrix 含 **0.01 uniform scale**，最上層另有 X 軸 -90° 的座標轉換。rig mapping 的固定 scene scale 必須補償這個匯入尺度；bone local translation 仍保持資產原值。

## Mesh／蒙皮檢查

| node | mesh/primitive | skin | vertices | JOINTS/WEIGHTS | 最大 joint index | 零權重頂點 | POSITION accessor min → max |
|---:|---:|---:|---:|---|---:|---:|---|
| 6 | 0/0 | 0 | 1942 | true/true | 44 | 0 | -30.133142471313477, -12.172027587890625, -4.5421366691589355 → 30.133142471313477, 12.21653938293457, 9.664070129394531 |

- inverseBindMatrices：每個 skin 均存在且 count 與 joints 相符
- 權重／joint index：結構有效，沒有超界 joint、負權重或零總權重頂點

## 瀏覽器 GLTFLoader／動態蒙皮驗證

結構檢查命令不把 JSON 解析誤稱為渲染成功。應用程式另在瀏覽器中以 GLTFLoader／useGLTF 載入此 hash，建立 SkeletonUtils clone，定位右食指第二節 `J_Right_HandIndex2_030`，挑出該 joint 權重最高的實際頂點，暫時旋轉骨骼 8°，並要求 `SkinnedMesh.applyBoneTransform` 前後位移大於 `1e-5`，隨後還原 rest transform。新增動作預覽及名稱重播的 Playwright 流程都必須看到 `GLB rig 已就緒` 與非零 `skin Δ`；失敗則由 ErrorBoundary 明示程序化降級。

## 骨架清單

模型不是 21 根骨骼。唯一 skin 有 46 個 joint，包含共用 root、左右手腕／掌部，以及每指四節（第四節為末端）。

| skin | skin joint | node | 名稱 | 父節點 | rest translation | 影響頂點數 |
|---:|---:|---:|---|---|---|---:|
| 0 | 0 | 5 | _rootJoint | Object_4 | 0, 0, 0 | 0 |
| 0 | 1 | 7 | Root_01 | _rootJoint | 0, 12, -2 | 0 |
| 0 | 2 | 8 | J_Left_02 | Root_01 | 24.63796043395996, 3.97139573097229, 1.9493438005447388 | 118 |
| 0 | 3 | 9 | J_Left_Hand_03 | J_Left_02 | 0.005323604680597782, 5.659482002258301, -0.08576340973377228 | 274 |
| 0 | 4 | 10 | J_Left_HandThumb1_04 | J_Left_Hand_03 | -3.5862550735473633, 0.7716284394264221, 1.1143436431884766 | 61 |
| 0 | 5 | 11 | J_Left_HandThumb2_05 | J_Left_HandThumb1_04 | -0.25511327385902405, 2.928236961364746, -0.3570595383644104 | 72 |
| 0 | 6 | 12 | J_Left_HandThumb3_06 | J_Left_HandThumb2_05 | -0.21663600206375122, 4.0370988845825195, -0.4207500219345093 | 68 |
| 0 | 7 | 13 | J_Left_HandThumb4_07 | J_Left_HandThumb3_06 | -0.2334362119436264, 3.0008633136749268, 0.052372146397829056 | 0 |
| 0 | 8 | 14 | J_Left_HandIndex1_08 | J_Left_Hand_03 | -3.6665234565734863, 7.560744285583496, -1.929523229598999 | 101 |
| 0 | 9 | 15 | J_Left_HandIndex2_09 | J_Left_HandIndex1_08 | -0.3218327462673187, 4.691822528839111, 0.12824700772762299 | 65 |
| 0 | 10 | 16 | J_Left_HandIndex3_010 | J_Left_HandIndex2_09 | -0.10836999863386154, 2.726752281188965, 0.2749742567539215 | 69 |
| 0 | 11 | 17 | J_Left_HandIndex4_011 | J_Left_HandIndex3_010 | -0.08589779585599899, 2.1812093257904053, 0.07124625146389008 | 0 |
| 0 | 12 | 18 | J_Left_HandMiddle1_012 | J_Left_Hand_03 | -1.2568167448043823, 7.651179790496826, -2.070892333984375 | 98 |
| 0 | 13 | 19 | J_Left_HandMiddle2_013 | J_Left_HandMiddle1_012 | -0.3702000081539154, 5.34291410446167, 0.559508740901947 | 72 |
| 0 | 14 | 20 | J_Left_HandMiddle3_014 | J_Left_HandMiddle2_013 | -0.2659062147140503, 3.322509765625, 0.3147149085998535 | 69 |
| 0 | 15 | 21 | J_Left_HandMiddle4_015 | J_Left_HandMiddle3_014 | -0.167480006814003, 2.1745996475219727, 0.09740553051233292 | 0 |
| 0 | 16 | 22 | J_Left_HandRing1_016 | J_Left_Hand_03 | 1.0622791051864624, 7.513143539428711, -1.281495451927185 | 87 |
| 0 | 17 | 23 | J_Left_HandRing2_017 | J_Left_HandRing1_016 | -0.042002927511930466, 4.728600025177002, 0.12401481717824936 | 78 |
| 0 | 18 | 24 | J_Left_HandRing3_00 | J_Left_HandRing2_017 | 0.10694923996925354, 2.7839443683624268, 0.23019179701805115 | 69 |
| 0 | 19 | 25 | J_Left_HandRing4_018 | J_Left_HandRing3_00 | -0.14423683285713196, 2.462902307510376, 0.042984459549188614 | 0 |
| 0 | 20 | 26 | J_Left_HandPinky1_019 | J_Left_Hand_03 | 2.882901668548584, 6.733603000640869, -0.07654611766338348 | 103 |
| 0 | 21 | 27 | J_Left_HandPinky2_020 | J_Left_HandPinky1_019 | 0.1420908123254776, 3.8278298377990723, -0.20524071156978607 | 71 |
| 0 | 22 | 28 | J_Left_HandPinky3_021 | J_Left_HandPinky2_020 | -0.24311032891273499, 2.333766460418701, -0.003548242151737213 | 69 |
| 0 | 23 | 29 | J_Left_HandPinky4_022 | J_Left_HandPinky3_021 | -0.0267733633518219, 1.890616536140442, -0.03274847939610481 | 0 |
| 0 | 24 | 30 | J_Right_023 | Root_01 | -26.737964630126953, 0.19920000433921814, 1.9493438005447388 | 118 |
| 0 | 25 | 31 | J_Right_Hand_024 | J_Right_023 | -0.0053206393495202065, -5.6594343185424805, 0.08581433445215225 | 274 |
| 0 | 26 | 32 | J_Right_HandThumb1_025 | J_Right_Hand_024 | 3.5862538814544678, -0.7716245651245117, -1.114343285560608 | 61 |
| 0 | 27 | 33 | J_Right_HandThumb2_026 | J_Right_HandThumb1_025 | 0.2551616132259369, -2.9282257556915283, 0.3570290207862854 | 72 |
| 0 | 28 | 34 | J_Right_HandThumb3_027 | J_Right_HandThumb2_026 | 0.216581329703331, -4.037111282348633, 0.4207864999771118 | 68 |
| 0 | 29 | 35 | J_Right_HandThumb4_028 | J_Right_HandThumb3_027 | 0.23346851766109467, -3.0008535385131836, -0.052391279488801956 | 0 |
| 0 | 30 | 36 | J_Right_HandIndex1_029 | J_Right_Hand_024 | 3.6665244102478027, -7.5607452392578125, 1.9295374155044556 | 101 |
| 0 | 31 | 37 | J_Right_HandIndex2_030 | J_Right_HandIndex1_029 | 0.32183000445365906, -4.691819190979004, -0.1282961070537567 | 65 |
| 0 | 32 | 38 | J_Right_HandIndex3_031 | J_Right_HandIndex2_030 | 0.1083717867732048, -2.7267513275146484, -0.27492719888687134 | 69 |
| 0 | 33 | 39 | J_Right_HandIndex4_032 | J_Right_HandIndex3_031 | 0.08589929342269897, -2.181220769882202, -0.07127092778682709 | 0 |
| 0 | 34 | 40 | J_Right_HandMiddle1_033 | J_Right_Hand_024 | 1.2568169832229614, -7.651176452636719, 2.070847511291504 | 98 |
| 0 | 35 | 41 | J_Right_HandMiddle2_034 | J_Right_HandMiddle1_033 | 0.3701949417591095, -5.342916488647461, -0.5595038533210754 | 72 |
| 0 | 36 | 42 | J_Right_HandMiddle3_035 | J_Right_HandMiddle2_034 | 0.26591092348098755, -3.322514772415161, -0.3147087097167969 | 69 |
| 0 | 37 | 43 | J_Right_HandMiddle4_036 | J_Right_HandMiddle3_035 | 0.167484849691391, -2.1745762825012207, -0.09738120436668396 | 0 |
| 0 | 38 | 44 | J_Right_HandRing1_037 | J_Right_Hand_024 | -1.0622767210006714, -7.513139724731445, 1.2814801931381226 | 87 |
| 0 | 39 | 45 | J_Right_HandRing2_038 | J_Right_HandRing1_037 | 0.042001690715551376, -4.728605270385742, -0.12403347343206406 | 78 |
| 0 | 40 | 46 | J_Right_HandRing3_039 | J_Right_HandRing2_038 | -0.10695771872997284, -2.783949613571167, -0.23023003339767456 | 69 |
| 0 | 41 | 47 | J_Right_HandRing4_040 | J_Right_HandRing3_039 | 0.14424967765808105, -2.4628961086273193, -0.04290507733821869 | 0 |
| 0 | 42 | 48 | J_Right_HandPinky1_041 | J_Right_Hand_024 | -2.882897138595581, -6.733603477478027, 0.07654476165771484 | 103 |
| 0 | 43 | 49 | J_Right_HandPinky2_042 | J_Right_HandPinky1_041 | -0.1420951783657074, -3.8278305530548096, 0.20524726808071136 | 71 |
| 0 | 44 | 50 | J_Right_HandPinky3_043 | J_Right_HandPinky2_042 | 0.2431078851222992, -2.3337807655334473, 0.003505116794258356 | 69 |
| 0 | 45 | 51 | J_Right_HandPinky4_044 | J_Right_HandPinky3_043 | 0.02677862159907818, -1.8906062841415405, 0.03275876119732857 | 0 |

## 結論與限制

- 結構檢查判定為 **rig-ready**：GLB 有可用 SkinnedMesh、雙手骨鏈、inverse bind matrices 與有效權重。
- 左右手位於同一個 SkinnedMesh／Skeleton；應用程式以 SkeletonUtils.clone 為每個觀測手建立獨立 skeleton clone，再驅動對應側 root 與骨鏈。
- 單手顯示時，未追蹤側會被移出場景；不把整個模型的預製 Idle 動畫當作使用者動作。
- 本報告不代表真人攝影機姿態已驗證；骨骼方向、拇指對掌、穿模與裝置效能仍需依 manual-camera-test 實測。
