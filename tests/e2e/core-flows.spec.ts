import { expect, test } from '@playwright/test';

test('合成 tracker 串起新增、重整持久化、辨識與 3D 重播', async ({ page }) => {
  await page.goto('/?syntheticTracker=1');
  await expect(page.getByText('合成追蹤測試模式｜不代表真實攝影機已驗證')).toBeVisible();
  await page.getByRole('button', { name: '啟動合成追蹤' }).click();
  await page.getByRole('button', { name: '錄製一次' }).click();
  await page.waitForTimeout(4_250);
  await page.getByRole('button', { name: '停止錄製' }).click();
  await expect(page.getByText('可儲存／可辨識')).toBeVisible();
  await page.getByLabel('自訂名稱').fill('測試滑動');
  await page.getByRole('button', { name: '儲存動作' }).click();
  await expect(page.getByText('測試滑動', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText('測試滑動', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /辨識動作/ }).click();
  await page.getByRole('button', { name: '啟動合成追蹤' }).click();
  await page.waitForTimeout(3_000);
  await page.getByRole('button', { name: '開始示範' }).click();
  await page.waitForTimeout(1_200);
  await page.getByRole('button', { name: '停止並辨識' }).click();
  await expect(page.getByText(/recognized|Unknown|Ambiguous|Invalid/).first()).toBeVisible();

  await page.getByRole('button', { name: /3D 重現/ }).click();
  await page.getByLabel('搜尋已儲存的動作').fill('測試滑動');
  await page.getByRole('button', { name: /測試滑動/ }).click();
  await expect(page.getByTestId('hand-scene')).toBeVisible();
  await page.getByRole('button', { name: '播放', exact: true }).click();
  await page.waitForTimeout(250);
  await expect(page.getByRole('button', { name: '暫停', exact: true })).toBeVisible();
  await page.getByLabel('播放進度').fill('600');
  await page.getByLabel('播放速度').selectOption('0.5');
});
