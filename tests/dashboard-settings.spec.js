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

  await page.locator('#openSettingsModalBtn').click();
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

test('shadowing seconds setting persists after save and reopen', async ({ page }) => {
  await page.goto('/index.html?devAuth=1');

  await expect(page.locator('#authUser')).toHaveText('ログイン済み');
  await page.evaluate(() => {
    const dialog = document.getElementById('settingsModal');
    if (!(dialog instanceof HTMLDialogElement)) throw new Error('settings modal not found');
    if (!dialog.open) dialog.showModal();
  });
  await expect(page.locator('#settingsModal')).toBeVisible();

  await page.locator('#modalSecShadowing').fill('180');
  await page.getByRole('button', { name: '保存して反映' }).click();
  await expect(page.locator('#modalSaveBtn')).toHaveText('反映済み');
  await expect(page.locator('#modalSecShadowing')).toHaveValue('180');

  await page.evaluate(() => {
    const dialog = document.getElementById('settingsModal');
    if (dialog instanceof HTMLDialogElement && dialog.open) dialog.close();
  });
  await page.evaluate(() => {
    const dialog = document.getElementById('settingsModal');
    if (!(dialog instanceof HTMLDialogElement)) throw new Error('settings modal not found');
    if (!dialog.open) dialog.showModal();
  });

  await expect(page.locator('#modalSecShadowing')).toHaveValue('180');
});

test('settings modal body scrolls to reveal the footer actions', async ({ page }) => {
  await page.goto('/index.html?devAuth=1');

  await expect(page.locator('#authUser')).toHaveText('ログイン済み');
  await expect(page.locator('#kpiRemaining')).toBeVisible();

  await page.evaluate(() => {
    const dialog = document.getElementById('settingsModal');
    if (!(dialog instanceof HTMLDialogElement)) throw new Error('settings modal not found');
    if (!dialog.open) dialog.showModal();
  });
  await expect(page.locator('#settingsModal')).toBeVisible();

  await page.setViewportSize({ width: 960, height: 560 });

  const body = page.locator('.settings-modal-body');

  const metricsBefore = await body.evaluate((node) => ({
    scrollHeight: node.scrollHeight,
    clientHeight: node.clientHeight,
    scrollTop: node.scrollTop
  }));

  expect(metricsBefore.scrollHeight).toBeGreaterThan(metricsBefore.clientHeight);

  await body.evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });

  await expect.poll(async () => body.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  await expect(page.locator('#modalSaveBtn')).toBeInViewport();
  await expect(page.locator('#modalSettingsStatus')).toBeInViewport();
});
