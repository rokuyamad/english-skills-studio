const { test, expect } = require('@playwright/test');

async function seedProgressData(page, { counts = {}, events = [], kv = {}, deleteKvKeys = [] } = {}) {
  await page.evaluate(async ({ counts, events, kv, deleteKvKeys }) => {
    await new Promise((resolve, reject) => {
      const req = indexedDB.open('english-skills-studio', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) {
          db.createObjectStore('kv', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('events')) {
          const eventStore = db.createObjectStore('events', { keyPath: 'id' });
          eventStore.createIndex('bySyncStatus', 'syncStatus', { unique: false });
          eventStore.createIndex('byOccurredAt', 'occurredAt', { unique: false });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['kv', 'events'], 'readwrite');
        const kvStore = tx.objectStore('kv');
        const eventStore = tx.objectStore('events');

        Object.entries(counts).forEach(([key, value]) => {
          kvStore.put({ key: `count:${key}`, value, updatedAt: Date.now() });
        });
        Object.entries(kv).forEach(([key, value]) => {
          kvStore.put({ key: `kv:${key}`, value, updatedAt: Date.now() });
        });
        deleteKvKeys.forEach((key) => {
          kvStore.delete(`kv:${key}`);
        });
        events.forEach((event) => {
          eventStore.put({ ...event, updatedAt: Date.now() });
        });

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('failed to seed progress data'));
        tx.onabort = () => reject(tx.error || new Error('failed to seed progress data'));
      };
      req.onerror = () => reject(req.error || new Error('failed to open IndexedDB'));
    });
  }, { counts, events, kv, deleteKvKeys });
}

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

test('shadowing seconds setting above 900 persists after save and reopen', async ({ page }) => {
  await page.goto('/index.html?devAuth=1');

  await expect(page.locator('#authUser')).toHaveText('ログイン済み');
  await expect(page.locator('#kpiRemaining')).toBeVisible();
  await page.locator('#openSettingsModalBtn').click();
  await expect(page.locator('#settingsModal')).toBeVisible();

  await page.locator('#modalSecShadowing').fill('1200');
  await page.getByRole('button', { name: '保存して反映' }).click();
  await expect(page.locator('#modalSaveBtn')).toHaveText('反映済み');
  await expect(page.locator('#modalSecShadowing')).toHaveValue('1200');

  await page.locator('#closeSettingsModalBtn').click();
  await page.locator('#openSettingsModalBtn').click();

  await expect(page.locator('#modalSecShadowing')).toHaveValue('1200');
});

test('metric changes affect only future study events and keep frozen baseline', async ({ page }) => {
  await page.goto('/index.html?devAuth=1');

  await expect(page.locator('#authUser')).toHaveText('ログイン済み');
  await seedProgressData(page, {
    counts: { 'shadowing:legacy': 6 },
    deleteKvKeys: ['study-dashboard-baseline-seconds:v1']
  });

  await page.reload();

  await expect(page.locator('#authUser')).toHaveText('ログイン済み');
  await expect(page.locator('#kpiShadowing')).toHaveText('0.2h');

  await page.locator('#openSettingsModalBtn').click();
  await expect(page.locator('#settingsModal')).toBeVisible();
  await page.locator('#modalSecShadowing').fill('300');
  await page.getByRole('button', { name: '保存して反映' }).click();
  await expect(page.locator('#modalSaveBtn')).toHaveText('反映済み');
  await expect(page.locator('#kpiShadowing')).toHaveText('0.2h');

  await seedProgressData(page, {
    events: [
      {
        id: 'test-shadowing-new-setting',
        occurredAt: '2026-03-31T09:00:00.000Z',
        pageKey: 'shadowing',
        contentKey: 'future-only',
        unitCount: 1,
        estimatedSeconds: 300,
        source: 'counter',
        syncStatus: 'synced'
      }
    ]
  });

  await page.reload();

  await expect(page.locator('#authUser')).toHaveText('ログイン済み');
  await expect(page.locator('#kpiShadowing')).toHaveText('0.3h');
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
