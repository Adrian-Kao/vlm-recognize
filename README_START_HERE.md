# Gesture Memory Studio｜Codex 開發文件包

這個文件包針對「連續動作新增與命名 → 再次示範辨識 → 輸入名稱以 3D 手重現」設計。

**本包是開發規格與提示詞，尚不含可執行應用程式或已訓練模型。**

## 內容

| 檔案 | 用途 |
|---|---|
| `PROJECT_SPEC.md` | 完整產品、架構、資料合約、DTW、座標、3D 重播、錯誤處理與驗收規格 |
| `CODEX_PROMPT.md` | 可以直接貼給 Codex 的開發提示詞 |
| `AGENTS.md` | 放在專案中的持續開發規則；既有檔案請合併，不要直接覆蓋 |
| `README_START_HERE.md` | 本說明 |

## 使用方式

將 `PROJECT_SPEC.md` 放入要開發的專案根目錄，並放入或合併 `AGENTS.md`。在同一專案開啟 Codex，貼上 `CODEX_PROMPT.md` 分隔線下方的提示詞。

沒有既有專案時，用一個空資料夾放置這些文件；提示詞會要求 Codex 建立 React + TypeScript + Vite 專案。有既有專案時，要求沿用結構並保護未提交修改。

Codex 官方說明將 AGENTS.md 用於專案指引，但本包仍要求提示詞明確指向 PROJECT_SPEC.md，避免完整規格未被讀取。[C1] 驗收項目及測試回報要求也已寫入提示詞。[C2]

## 本版的重要決策

核心使用 MediaPipe、Three.js、Dexie 及時序 DTW，不綁定大型 VLM 或付費 API。完整 motion sequence 同時支持辨識與重播；名稱查詢重播的是使用者真的錄下來的示範，不是生成器的想像。

3D 以程序化立體手起步，不需另外尋找手模型。單鏡頭深度有明確限制：局部 3D 手形加上影像平面軌跡，不假裝精密的全域動作捕捉。

規格中的數值是開發預設或量測目標，尚未透過真人攝影機驗證。Codex 需要實作程式、執行測試，並明示未完成的實機驗證。

## Codex 官方參考

- [C1] AGENTS.md：<https://developers.openai.com/codex/agent-configuration/agents-md>
- [C2] 開發與測試實務：<https://developers.openai.com/codex/learn/best-practices>

技術工具參考位於 `PROJECT_SPEC.md` 文末。查閱日期：2026-10-09。
