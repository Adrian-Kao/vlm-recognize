# 工程決策與已知限制

## 座標假設

MediaPipe image landmarks 的 x/y 是影像正規化座標；world landmarks 以手部幾何中心為參考。辨識先將 image x/y 乘實際影片寬高，避免 16:9 畫面被當成正方形。重播採固定 provider-to-scene 基底 `(x, -y, -z)`，局部手形與影像平面 root trajectory 分開計算。

V1 的 scene root Z 明確固定為 0。這是展示假設，不是相機全域深度。需以真人相機再次檢查左右手、掌心法向與 UI 鏡像方向。

## 品質與拒絕

集中設定在 `src/app/config.ts`：最短 500 ms、最長 8 s、至少 8 個有效觀測、有效時間比例 90%、短缺口 150 ms、追蹤中斷 250 ms。單手／雙手 topology、左右手角色或 association 不相容時不比對。

DTW `maxDistance=0.35` 與 `minClassMargin=0.15` 只是未校準初值。UI 不將距離表達為機率。正式校準需要獨立的新正例與未知負例；目前只維護 `uncalibrated`／`provisional`／`stale` 狀態，未宣稱 `validated`。

## 自動切段

狀態為 `NO_HAND → READY → MOVING → END_PENDING → CLASSIFYING → COOLDOWN`。第一版要求動作後短暫停頓；動作中停頓超過 500 ms 可能切成兩段，因此保留手動切段。motion energy 同時包含 wrist velocity 與 landmark shape change。

## 雙手

最多兩手，使用 wrist continuity、短期速度與穩定 handedness 做兩種配對成本比較。雙手共用時間軸與場景尺度。交叉或配對成本接近時標示 ambiguous 並拒絕，不宣稱嚴重遮蔽可靠。

## 未包含

沒有 VLM、文字生成動作、雲端同步、付費 API、GLB 資產、全域深度估計、任意無停頓串流切詞、外部命令執行或準確率保證。
