import {
  decrementDueBadgeCount,
  requireAuthOrRedirect,
  setDueBadgeCount,
  setupTopbarAuth
} from './auth-ui.js';
import { initMobileTopbar } from './mobile-topbar.js';
import { fetchDueCards, fetchDueCount, fetchTodayReviewCount, submitReview } from './srs-api.js';
import { openSrsDraftModal } from './srs-draft-modal.js';
import { getEffectiveStudySettings } from './study-settings.js';
import { buildStudyEvent, recordAndMaybeFlush } from './study-sync.js';

const DAILY_REVIEW_LIMIT = 20;

const state = {
  cardTypeFilter: 'all',
  queue: [],
  current: null,
  showingHint: false,
  showingAnswer: false,
  busy: false,
  todayReviewed: 0,
  totalDue: 0
};

function getEl(id) {
  return document.getElementById(id);
}

function setBusy(isBusy) {
  state.busy = Boolean(isBusy);
  const hintBtn = getEl('hintBtn');
  const revealBtn = getEl('revealBtn');
  const gradeBtns = document.querySelectorAll('.review-grade-btn');

  if (hintBtn) hintBtn.disabled = state.busy || !state.current;
  if (revealBtn) revealBtn.disabled = state.busy || !state.current;
  gradeBtns.forEach((btn) => {
    btn.disabled = state.busy || !state.current || !state.showingAnswer;
  });
}

function setStatus(message, isError = false) {
  const el = getEl('reviewStatus');
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? '#ff9f9f' : '#d2dbef';
}

function updateFilterUI() {
  document.querySelectorAll('.review-filter-btn').forEach((btn) => {
    const value = btn.dataset.filter || 'all';
    btn.classList.toggle('active', value === state.cardTypeFilter);
  });
}

function renderQueueMeta() {
  const dueEl = getEl('dueCountLabel');
  const queueEl = getEl('queueCountLabel');
  const todayEl = getEl('todayCountLabel');
  if (dueEl) dueEl.textContent = `Due ${state.totalDue}`;
  if (queueEl) queueEl.textContent = `Queue ${state.queue.length}`;
  if (todayEl) todayEl.textContent = `Today ${Math.min(state.todayReviewed, DAILY_REVIEW_LIMIT)}/${DAILY_REVIEW_LIMIT}`;
}

function hasReachedDailyLimit() {
  return state.todayReviewed >= DAILY_REVIEW_LIMIT;
}

function getAvailableDueCount(totalDue, todayReviewed) {
  const safeDue = Math.max(0, Number(totalDue || 0));
  const safeReviewed = Math.max(0, Number(todayReviewed || 0));
  const remainingDailyCapacity = Math.max(0, DAILY_REVIEW_LIMIT - safeReviewed);
  return Math.min(safeDue, remainingDailyCapacity);
}

function renderCard() {
  const cardEl = document.querySelector('.review-card');
  const categoryEl = getEl('cardCategory');
  const directionEl = getEl('cardDirection');
  const frontEl = getEl('cardFront');

  const hintWrap = getEl('cardHintWrap');
  const hintEl = getEl('cardHint');

  const backWrap = getEl('cardBackWrap');
  const backPrimaryEl = getEl('cardBackPrimary');
  const backSecondaryEl = getEl('cardBackSecondary');

  const emptyEl = getEl('emptyState');
  const hintBtn = getEl('hintBtn');
  const revealBtn = getEl('revealBtn');

  if (!state.current) {
    if (cardEl) {
      cardEl.classList.remove('is-hint-open');
      cardEl.classList.remove('is-answer-open');
    }
    if (categoryEl) categoryEl.textContent = 'CARD';
    if (directionEl) directionEl.textContent = 'EN→JA';
    if (frontEl) frontEl.textContent = 'No card';
    if (hintEl) hintEl.textContent = '';
    if (backPrimaryEl) backPrimaryEl.textContent = '';
    if (backSecondaryEl) backSecondaryEl.textContent = '';

    if (hintWrap) hintWrap.classList.add('hidden');
    if (backWrap) backWrap.classList.add('hidden');

    if (emptyEl) emptyEl.classList.remove('hidden');
    if (hintBtn) hintBtn.disabled = true;
    if (revealBtn) revealBtn.disabled = true;

    document.querySelectorAll('.review-grade-btn').forEach((btn) => {
      btn.disabled = true;
    });
    return;
  }

  if (categoryEl) categoryEl.textContent = String(state.current.cardType || 'card').toUpperCase();
  if (directionEl) directionEl.textContent = state.current.directionLabel || 'EN→JA';
  if (frontEl) frontEl.textContent = state.current.promptText || 'No prompt';

  if (hintEl) hintEl.textContent = state.current.hintText || '例文なし';
  if (backPrimaryEl) backPrimaryEl.textContent = state.current.answerPrimary || 'No answer';
  if (backSecondaryEl) backSecondaryEl.textContent = state.current.answerSecondary || '';

  if (hintWrap) hintWrap.classList.toggle('hidden', !state.showingHint);
  if (backWrap) backWrap.classList.toggle('hidden', !state.showingAnswer);
  if (cardEl) {
    cardEl.classList.toggle('is-hint-open', state.showingHint);
    cardEl.classList.toggle('is-answer-open', state.showingAnswer);
  }
  if (emptyEl) emptyEl.classList.add('hidden');

  if (hintBtn) {
    hintBtn.disabled = state.busy ? true : state.showingHint;
    hintBtn.textContent = state.showingHint ? 'Hint表示中' : 'Hint';
  }

  if (revealBtn) {
    revealBtn.disabled = state.busy;
    revealBtn.textContent = state.showingAnswer ? '答え表示中' : '答えを見る';
  }

  document.querySelectorAll('.review-grade-btn').forEach((btn) => {
    btn.disabled = !state.showingAnswer || state.busy;
  });
}

async function loadQueue() {
  setBusy(true);
  setStatus('復習キューを読み込み中...');

  try {
    const settings = await getEffectiveStudySettings();
    const [todayReviewed, totalDue] = await Promise.all([
      fetchTodayReviewCount({ timeZone: settings.timezone }),
      fetchDueCount({ cardType: 'all' })
    ]);

    state.todayReviewed = todayReviewed;
    state.totalDue = totalDue;
    const remaining = Math.max(0, DAILY_REVIEW_LIMIT - state.todayReviewed);
    const queue = remaining > 0
      ? await fetchDueCards({ cardType: state.cardTypeFilter, limit: Math.min(60, remaining) })
      : [];

    state.queue = queue;
    state.current = queue[0] || null;
    state.showingHint = false;
    state.showingAnswer = false;

    renderQueueMeta();
    renderCard();
    setDueBadgeCount(getAvailableDueCount(totalDue, todayReviewed));

    if (hasReachedDailyLimit()) {
      setStatus(`本日のSRSは上限 ${DAILY_REVIEW_LIMIT} 件に達しました。`);
    } else if (!state.current) {
      setStatus('現在、復習待ちはありません。');
    } else {
      setStatus('カードを表示しました。');
    }
  } catch (error) {
    console.error(error);
    setStatus('復習キューの読み込みに失敗しました。', true);
  } finally {
    setBusy(false);
    renderCard();
  }
}

function bindFilterButtons() {
  document.querySelectorAll('.review-filter-btn').forEach((btn) => {
    if (btn.dataset.bound === 'true') return;
    btn.dataset.bound = 'true';
    btn.addEventListener('click', async () => {
      state.cardTypeFilter = btn.dataset.filter || 'all';
      updateFilterUI();
      await loadQueue();
    });
  });
}

function bindHintButton() {
  const btn = getEl('hintBtn');
  if (!btn || btn.dataset.bound === 'true') return;

  btn.dataset.bound = 'true';
  btn.addEventListener('click', () => {
    if (!state.current || state.busy) return;
    state.showingHint = true;
    renderCard();
    setStatus('Hintを表示しました。');
  });
}

function bindRevealButton() {
  const btn = getEl('revealBtn');
  if (!btn || btn.dataset.bound === 'true') return;

  btn.dataset.bound = 'true';
  btn.addEventListener('click', () => {
    if (!state.current || state.busy) return;
    state.showingAnswer = true;
    renderCard();
    setStatus('評価を選んでください。');
  });
}

function bindGradeButtons() {
  document.querySelectorAll('.review-grade-btn').forEach((btn) => {
    if (btn.dataset.bound === 'true') return;
    btn.dataset.bound = 'true';

    btn.addEventListener('click', async () => {
      if (!state.current || state.busy || !state.showingAnswer) return;
      const grade = btn.dataset.grade;
      if (!grade) return;

      setBusy(true);
      setStatus('レビュー結果を保存中...');

      try {
        const reviewedCard = state.current;
        await submitReview({
          cardId: reviewedCard.cardId,
          direction: reviewedCard.direction,
          grade
        });
        const settings = await getEffectiveStudySettings();
        const event = buildStudyEvent({
          pageKey: 'srs',
          contentKey: `srs:${reviewedCard.cardId}:${reviewedCard.direction}`,
          settings
        });
        await recordAndMaybeFlush(event);
        state.totalDue = Math.max(0, state.totalDue - 1);
        renderQueueMeta();
        decrementDueBadgeCount();
        await loadQueue();
        if (hasReachedDailyLimit()) {
          setStatus(`本日のSRSは上限 ${DAILY_REVIEW_LIMIT} 件に達しました。`);
        }
      } catch (error) {
        console.error(error);
        setStatus('保存に失敗しました。通信状態とDB設定を確認してください。', true);
      } finally {
        setBusy(false);
        renderCard();
      }
    });
  });
}

function bindNewCardModal() {
  const openBtn = getEl('newCardBtn');
  if (!openBtn || openBtn.dataset.bound === 'true') return;

  openBtn.dataset.bound = 'true';
  openBtn.addEventListener('click', () => {
    openSrsDraftModal({
      onSaved: async (result) => {
        await loadQueue();
        if (result.result === 'duplicate') {
          setStatus(`「${result.termEn}」は既に登録済みです。`);
          return;
        }
        if (result.result === 'updated') {
          setStatus(
            result.status === 'ready'
              ? `「${result.termEn}」の既存draftを更新して復習対象にしました。`
              : `「${result.termEn}」の既存draftを更新しました。`
          );
          return;
        }
        setStatus(
          result.status === 'ready'
            ? `「${result.termEn}」を追加して復習対象にしました。`
            : `「${result.termEn}」を下書きカードとして追加しました。`
        );
      }
    });
  });
}

async function bootstrap() {
  const isAuthenticated = await requireAuthOrRedirect();
  if (!isAuthenticated) return;

  initMobileTopbar();
  await setupTopbarAuth();

  bindFilterButtons();
  bindHintButton();
  bindRevealButton();
  bindGradeButtons();
  bindNewCardModal();

  updateFilterUI();
  await loadQueue();
}

bootstrap();
