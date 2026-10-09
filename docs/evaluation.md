# 測試與量測界線

自動測試涵蓋 DTW 時序、速度伸縮、相反方向、相反姿勢順序、Unknown、Ambiguous、雙手 topology、association、切段防重複、IndexedDB 重開、改名、代表樣本、匯出匯入與播放時間。

Playwright 透過 `VITE_TEST_TRACKER=1` 使用 seeded／確定性的合成追蹤，頁面有永久可見的測試標籤。它驗證三頁流程，但不量測 MediaPipe 模型、攝影機、GPU 或真人辨識準確率。

待真人測試的準確率、未知誤接受率、追蹤 FPS、3D FPS、DTW p50/p95 與端對端延遲目前均為「未量測」。
