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
const EASY_THRESHOLD_MS = 15 * 1000;
const GOOD_THRESHOLD_MS = 30 * 1000;

const state = {
  queue: [],
  current: null,
  showingHint: false,
  showingAnswer: false,
  busy: false,
  todayReviewed: 0,
  totalDue: 0,
  startedAt: 0,
  elapsedMs: 0,
  pendingGrade: '',
  timeoutId: null,
  tickId: null
};

function getEl(id) {
  return document.getElementById(id);
}

function clearCardTimers() {
  if (state.timeoutId) {
    window.clearTimeout(state.timeoutId);
    state.timeoutId = null;
  }
  if (state.tickId) {
    window.clearInterval(state.tickId);
    state.tickId = null;
  }
}

function updateElapsedMs() {
  if (!state.startedAt) {
    state.elapsedMs = 0;
    return;
  }
  state.elapsedMs = Math.max(0, Date.now() - state.startedAt);
}

function formatElapsedLabel() {
  const seconds = Math.min(99, Math.floor(state.elapsedMs / 1000));
  return `Time ${seconds}s`;
}

function getElapsedGrade(elapsedMs) {
  if (elapsedMs <= EASY_THRESHOLD_MS) return 'easy';
  if (elapsedMs <= GOOD_THRESHOLD_MS) return 'good';
  return 'again';
}

function getGradeMessage(grade, isTimedOut = false) {
  if (isTimedOut || grade === 'again') {
    return '30秒を超えたため Again です。Again を押して進めてください。';
  }
  if (grade === 'good') {
    return '15秒を超えたので Good です。Good を押して進めてください。';
  }
  return '15秒以内なので Easy です。Easy を押して進めてください。';
}

function startCardTimers() {
  clearCardTimers();
  state.startedAt = Date.now();
  state.elapsedMs = 0;

  if (!state.current) return;

  state.timeoutId = window.setTimeout(() => {
    revealAnswer({ isTimedOut: true });
  }, GOOD_THRESHOLD_MS);

  state.tickId = window.setInterval(() => {
    updateElapsedMs();
    renderQueueMeta();
  }, 1000);
}

function setCurrentCard(card) {
  clearCardTimers();
  state.current = card || null;
  state.showingHint = false;
  state.showingAnswer = false;
  state.pendingGrade = '';
  state.startedAt = 0;
  state.elapsedMs = 0;
  if (state.current) {
    startCardTimers();
  }
}

function setBusy(isBusy) {
  state.busy = Boolean(isBusy);
  const hintBtn = getEl('hintBtn');
  const revealBtn = getEl('revealBtn');
  const gradeBtns = document.querySelectorAll('.review-grade-btn');

  if (hintBtn) hintBtn.disabled = state.busy || !state.current;
  if (revealBtn) revealBtn.disabled = state.busy || !state.current || state.showingAnswer;
  gradeBtns.forEach((btn) => {
    const buttonGrade = btn.dataset.grade || '';
    const isEligible = state.showingAnswer && state.pendingGrade && buttonGrade === state.pendingGrade;
    btn.disabled = state.busy || !state.current || !isEligible;
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
  const timeEl = getEl('timeCountLabel');
  if (dueEl) dueEl.textContent = `Due ${state.totalDue}`;
  if (queueEl) queueEl.textContent = `Queue ${state.queue.length}`;
  if (todayEl) todayEl.textContent = `Today ${Math.min(state.todayReviewed, DAILY_REVIEW_LIMIT)}/${DAILY_REVIEW_LIMIT}`;
  if (timeEl) timeEl.textContent = formatElapsedLabel();
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
    renderQueueMeta();
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
    revealBtn.disabled = state.busy || state.showingAnswer;
    revealBtn.textContent = state.showingAnswer ? '答え表示中' : '答えを見る';
  }

  document.querySelectorAll('.review-grade-btn').forEach((btn) => {
    const buttonGrade = btn.dataset.grade || '';
    const isEligible = state.showingAnswer && state.pendingGrade && buttonGrade === state.pendingGrade;
    btn.disabled = !isEligible || state.busy;
  });

  renderQueueMeta();
}

function revealAnswer({ isTimedOut = false } = {}) {
  if (!state.current || state.busy || state.showingAnswer) return;

  updateElapsedMs();
  if (isTimedOut) {
    state.elapsedMs = Math.max(state.elapsedMs, GOOD_THRESHOLD_MS + 1);
  }
  clearCardTimers();
  state.pendingGrade = isTimedOut ? 'again' : getElapsedGrade(state.elapsedMs);
  state.showingAnswer = true;
  renderCard();
  setStatus(getGradeMessage(state.pendingGrade, isTimedOut));
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
    setCurrentCard(queue[0] || null);

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
    revealAnswer();
  });
}

function bindGradeButtons() {
  document.querySelectorAll('.review-grade-btn').forEach((btn) => {
    if (btn.dataset.bound === 'true') return;
    btn.dataset.bound = 'true';

    btn.addEventListener('click', async () => {
      if (!state.current || state.busy || !state.showingAnswer) return;
      const grade = btn.dataset.grade;
      if (!grade || grade !== state.pendingGrade) return;

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
        setCurrentCard(state.queue[0] || null);

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
