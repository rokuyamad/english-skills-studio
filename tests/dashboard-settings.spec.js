const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    const stub = {
      register: async () => ({}),
      getRegistrations: async () => [],
      addEventListener: () => {},
      removeEventListener: () => {}
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: stub
    });
  });
});

test('dashboard settings save reflects immediately with dev auth', async ({ page }) => {
  await page.goto('/index.html?devAuth=1');

  await expect(page.locator('#authUser')).toHaveText('ログイン済み');
  await expect(page.locator('#kpiRemaining')).toHaveText('1000.0h');

  await page.getByRole('button', { name: '設定' }).click();
  await expect(page.locator('#settingsModal')).toBeVisible();

  await page.locator('#modalGoalHours').fill('1234');
  await expect(page.locator('[data-settings-state]')).toHaveText('未保存の変更');

  await page.getByRole('button', { name: '保存して反映' }).click();

  await expect(page.locator('#modalSettingsStatus')).toContainText('この端末には保存しました。オンライン復帰後に同期されます。');
  await expect(page.locator('[data-settings-state]')).toHaveText('ダッシュボードへ反映済み');
  await expect(page.locator('#modalSaveBtn')).toHaveText('反映済み');
  await expect(page.locator('#kpiRemaining')).toHaveText('1234.0h');

  await page.reload();

  await expect(page.locator('#authUser')).toHaveText('ログイン済み');
  await expect(page.locator('#kpiRemaining')).toHaveText('1234.0h');
});
