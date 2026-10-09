import { expect, test } from '@playwright/test';

test('雙手片段建立兩個獨立 GLB skeleton clone 並同步預覽', async ({ page }, testInfo) => {
  await page.goto('/?syntheticTracker=1');
  await page.getByLabel('手部模式').selectOption('dual');
  await page.getByRole('button', { name: '啟動合成追蹤' }).click();
  await page.getByRole('button', { name: '錄製一次' }).click();
  await page.waitForTimeout(4_250);
  await page.getByRole('button', { name: '停止錄製' }).click();
  const status = page.getByTestId('hand-asset-status');
  await expect(status).toContainText('GLB rig 已就緒', { timeout: 15_000 });
  await expect(status).toContainText('skin Δ');
  await expect(status).toHaveAttribute('data-skeleton-instances', '2');
  await page.getByTestId('hand-scene').screenshot({ path: testInfo.outputPath('dual-glb-preview.png') });
  await page.getByLabel('手部顯示模式').selectOption('raw');
  await page.getByTestId('hand-scene').screenshot({ path: testInfo.outputPath('dual-raw-preview.png') });
});
