import {
  requireAuthOrRedirect,
  setupTopbarAuth
} from './auth-ui.js';
import { initMobileTopbar } from './mobile-topbar.js';
import { fetchDueQaCards, fetchDueQaCount, submitQaReview } from './qa-api.js';
import { openQaDraftModal } from './qa-draft-modal.js';
import { getEffectiveStudySettings } from './study-settings.js';
import { buildStudyEvent, recordAndMaybeFlush } from './study-sync.js';

const DAILY_REVIEW_LIMIT = 20;

const state = {
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

function renderCard() {
  const cardEl = document.querySelector('.review-card');
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
    if (frontEl) frontEl.textContent = '';
    if (hintEl) hintEl.textContent = '';
    if (backPrimaryEl) backPrimaryEl.textContent = '';
    if (backSecondaryEl) backSecondaryEl.textContent = '';
    if (hintWrap) hintWrap.classList.add('hidden');
    if (backWrap) backWrap.classList.add('hidden');
    if (emptyEl) emptyEl.classList.remove('hidden');
    if (hintBtn) hintBtn.disabled = true;
    if (revealBtn) revealBtn.disabled = true;
    document.querySelectorAll('.review-grade-btn').forEach((btn) => { btn.disabled = true; });
    return;
  }

  if (frontEl) frontEl.textContent = state.current.question;
  if (hintEl) hintEl.textContent = state.current.hint || '（ヒントなし）';
  if (backPrimaryEl) backPrimaryEl.textContent = state.current.answerEn;
  if (backSecondaryEl) backSecondaryEl.textContent = state.current.answerJa || '';

  if (hintWrap) hintWrap.classList.toggle('hidden', !state.showingHint);
  if (backWrap) backWrap.classList.toggle('hidden', !state.showingAnswer);
  if (cardEl) {
    cardEl.classList.toggle('is-hint-open', state.showingHint);
    cardEl.classList.toggle('is-answer-open', state.showingAnswer);
  }
  if (emptyEl) emptyEl.classList.add('hidden');

  if (hintBtn) {
    hintBtn.disabled = state.busy ? true : (state.showingHint || !state.current.hint);
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
    const [totalDue] = await Promise.all([
      fetchDueQaCount()
    ]);

    state.totalDue = totalDue;
    const remaining = Math.max(0, DAILY_REVIEW_LIMIT - state.todayReviewed);
    const queue = remaining > 0
      ? await fetchDueQaCards({ limit: Math.min(60, remaining) })
      : [];

    state.queue = queue;
    state.current = queue[0] || null;
    state.showingHint = false;
    state.showingAnswer = false;

    renderQueueMeta();
    renderCard();

    if (hasReachedDailyLimit()) {
      setStatus(`本日の QA ドリルは上限 ${DAILY_REVIEW_LIMIT} 件に達しました。`);
    } else if (!state.current) {
      setStatus('現在、復習待ちはありません。');
    } else {
      setStatus('');
    }
  } catch (error) {
    console.error(error);
    setStatus('復習キューの読み込みに失敗しました。', true);
  } finally {
    setBusy(false);
    renderCard();
  }
}

function bindHintButton() {
  const btn = getEl('hintBtn');
  if (!btn || btn.dataset.bound === 'true') return;
  btn.dataset.bound = 'true';
  btn.addEventListener('click', () => {
    if (!state.current || state.busy) return;
    state.showingHint = true;
    renderCard();
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
      setStatus('保存中...');

      try {
        const reviewedCard = state.current;
        await submitQaReview({ cardId: reviewedCard.cardId, grade });

        const settings = await getEffectiveStudySettings();
        const event = buildStudyEvent({
          pageKey: 'srs',
          contentKey: `qa:${reviewedCard.cardId}`,
          settings
        });
        await recordAndMaybeFlush(event);

        state.todayReviewed += 1;
        state.totalDue = Math.max(0, state.totalDue - 1);

        state.queue = state.queue.slice(1);
        state.current = state.queue[0] || null;
        state.showingHint = false;
        state.showingAnswer = false;

        renderQueueMeta();
        renderCard();

        if (!state.current && state.totalDue > 0) {
          await loadQueue();
        } else if (hasReachedDailyLimit()) {
          setStatus(`本日の QA ドリルは上限 ${DAILY_REVIEW_LIMIT} 件に達しました。`);
        } else if (!state.current) {
          setStatus('本日の復習は完了しました。');
        }
      } catch (error) {
        console.error(error);
        setStatus('保存に失敗しました。', true);
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
    openQaDraftModal({
      onSaved: async (result) => {
        if (result.result === 'duplicate') {
          setStatus('この質問は既に登録済みです。');
          return;
        }
        setStatus(`「${String(result.question || '').slice(0, 40)}」を追加しました。`);
        await loadQueue();
      }
    });
  });
}

async function bootstrap() {
  const isAuthenticated = await requireAuthOrRedirect();
  if (!isAuthenticated) return;

  initMobileTopbar();
  await setupTopbarAuth();

  bindHintButton();
  bindRevealButton();
  bindGradeButtons();
  bindNewCardModal();

  await loadQueue();
}

bootstrap();
