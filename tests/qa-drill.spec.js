const { test, expect } = require('@playwright/test');

async function stubQaModules(page, { cards, totalDue = cards.length }) {
  await page.route('**/js/auth-ui.js', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `
        export async function requireAuthOrRedirect() { return true; }
        export async function setupTopbarAuth() {}
      `
    });
  });

  await page.route('**/js/mobile-topbar.js', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: 'export function initMobileTopbar() {}'
    });
  });

  await page.route('**/js/qa-draft-modal.js', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: 'export function openQaDraftModal() {}'
    });
  });

  await page.route('**/js/study-settings.js', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: 'export async function getEffectiveStudySettings() { return { timezone: "Asia/Tokyo" }; }'
    });
  });

  await page.route('**/js/study-sync.js', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `
        export function buildStudyEvent(payload) { return payload; }
        export async function recordAndMaybeFlush() {}
      `
    });
  });

  await page.route('**/js/qa-api.js', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `
        const cards = ${JSON.stringify(cards)};
        export async function fetchDueQaCount() { return ${JSON.stringify(totalDue)}; }
        export async function fetchDueQaCards() { return cards; }
        export async function submitQaReview(payload) {
          globalThis.__qaReviewPayloads = globalThis.__qaReviewPayloads || [];
          globalThis.__qaReviewPayloads.push(payload);
          return { ok: true };
        }
      `
    });
  });
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

test('qa drill shows Japanese prompt and auto-selects Easy within 15 seconds', async ({ page }) => {
  await stubQaModules(page, {
    cards: [
      {
        cardId: 'qa-1',
        question: 'あなたの会社はどのようなサービスを提供していますか？',
        hint: 'provide A such as B',
        answerEn: 'We provide consulting and training services.',
        answerJa: 'コンサルティングと研修サービスを提供しています。'
      }
    ]
  });

  await page.goto('/qa-drill.html');

  await expect(page.locator('.review-direction')).toHaveText('JA → EN');
  await expect(page.locator('#cardFront')).toHaveText('あなたの会社はどのようなサービスを提供していますか？');

  await page.locator('#revealBtn').click();

  await expect(page.locator('#cardBackPrimary')).toHaveText('We provide consulting and training services.');
  await expect(page.locator('#reviewStatus')).toContainText('15秒以内なので Easy');
  await expect(page.locator('.review-grade-btn.easy')).toBeEnabled();
  await expect(page.locator('.review-grade-btn.good')).toBeDisabled();
  await expect(page.locator('.review-grade-btn.again')).toBeDisabled();
});

test('qa drill auto-reveals after timeout and only allows Again', async ({ page }) => {
  await page.addInitScript(() => {
    let now = 0;
    const realDateNow = Date.now.bind(Date);
    const realSetTimeout = window.setTimeout.bind(window);
    Date.now = () => now || realDateNow();
    window.setTimeout = (fn, ms, ...args) => {
      if (ms === 30000) {
        return realSetTimeout(() => {
          now = 31000;
          fn(...args);
        }, 5);
      }
      return realSetTimeout(fn, ms, ...args);
    };
  });

  await stubQaModules(page, {
    cards: [
      {
        cardId: 'qa-2',
        question: '今のプロジェクトで一番大きな課題は何ですか？',
        hint: '',
        answerEn: 'The biggest challenge is aligning the schedule across teams.',
        answerJa: '一番大きな課題は、チーム間でスケジュールを揃えることです。'
      }
    ]
  });

  await page.goto('/qa-drill.html');

  await expect(page.locator('#cardBackWrap')).toBeVisible();
  await expect(page.locator('#reviewStatus')).toContainText('30秒を超えたため Again');
  await expect(page.locator('.review-grade-btn.again')).toBeEnabled();
  await expect(page.locator('.review-grade-btn.good')).toBeDisabled();
  await expect(page.locator('.review-grade-btn.easy')).toBeDisabled();
});
