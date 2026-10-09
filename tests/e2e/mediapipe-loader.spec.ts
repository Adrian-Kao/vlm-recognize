import { expect, test } from '@playwright/test';

test('MediaPipe module worker 可從 Vite 資產 URL 初始化', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '啟用攝影機' }).click();
  await expect(page.getByText(/追蹤就緒（(?:GPU|CPU)/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: '停止攝影機' })).toBeVisible();
});
