import { requireAuthOrRedirect, setupTopbarAuth, refreshDueBadge } from './auth-ui.js';
import { initMobileTopbar } from './mobile-topbar.js';
import { createDraftCard, fetchDueCards, fetchDueCount, submitReview } from './srs-api.js';
import { getEffectiveStudySettings } from './study-settings.js';
import { buildStudyEvent, recordAndMaybeFlush } from './study-sync.js';

const state = {
  cardTypeFilter: 'all',
  queue: [],
  current: null,
  showingHint: false,
  showingAnswer: false,
  busy: false
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

function renderQueueMeta(totalDue) {
  const dueEl = getEl('dueCountLabel');
  const queueEl = getEl('queueCountLabel');
  if (dueEl) dueEl.textContent = `Due ${totalDue}`;
  if (queueEl) queueEl.textContent = `Queue ${state.queue.length}`;
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
    const [queue, totalDue] = await Promise.all([
      fetchDueCards({ cardType: state.cardTypeFilter, limit: 60 }),
      fetchDueCount({ cardType: 'all' })
    ]);

    state.queue = queue;
    state.current = queue[0] || null;
    state.showingHint = false;
    state.showingAnswer = false;

    renderQueueMeta(totalDue);
    renderCard();
    await refreshDueBadge();

    if (!state.current) {
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
        await loadQueue();
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

function setNewCardModalOpen(isOpen) {
  const backdrop = getEl('newCardModalBackdrop');
  if (!backdrop) return;
  backdrop.classList.toggle('hidden', !isOpen);

  const input = getEl('newCardWordInput');
  const errorEl = getEl('newCardModalError');
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
  }

  if (isOpen && input) {
    input.value = '';
    input.focus();
  }
}

async function saveNewWordFromModal() {
  const input = getEl('newCardWordInput');
  const saveBtn = getEl('newCardSaveBtn');
  const errorEl = getEl('newCardModalError');
  if (!input || !saveBtn || !errorEl) return;

  const value = String(input.value || '').trim();
  if (!value) {
    errorEl.textContent = '単語を入力してください。';
    errorEl.classList.remove('hidden');
    input.focus();
    return;
  }

  saveBtn.disabled = true;
  errorEl.classList.add('hidden');

  try {
    const result = await createDraftCard({ termEn: value });
    if (result.result === 'duplicate') {
      setStatus(`「${result.termEn}」は既に登録済みです。`);
    } else {
      setStatus(`「${result.termEn}」を下書きカードとして追加しました。`);
    }
    setNewCardModalOpen(false);
    await refreshDueBadge();
  } catch (error) {
    console.error(error);
    errorEl.textContent = '1語の英単語のみ登録できます（例: simultaneously）。';
    errorEl.classList.remove('hidden');
  } finally {
    saveBtn.disabled = false;
  }
}

function bindNewCardModal() {
  const openBtn = getEl('newCardBtn');
  const backdrop = getEl('newCardModalBackdrop');
  const cancelBtn = getEl('newCardCancelBtn');
  const saveBtn = getEl('newCardSaveBtn');
  const input = getEl('newCardWordInput');
  if (!openBtn || !backdrop || !cancelBtn || !saveBtn || !input) return;

  if (openBtn.dataset.bound !== 'true') {
    openBtn.dataset.bound = 'true';
    openBtn.addEventListener('click', () => setNewCardModalOpen(true));
  }

  if (cancelBtn.dataset.bound !== 'true') {
    cancelBtn.dataset.bound = 'true';
    cancelBtn.addEventListener('click', () => setNewCardModalOpen(false));
  }

  if (saveBtn.dataset.bound !== 'true') {
    saveBtn.dataset.bound = 'true';
    saveBtn.addEventListener('click', saveNewWordFromModal);
  }

  if (input.dataset.bound !== 'true') {
    input.dataset.bound = 'true';
    input.addEventListener('keydown', async (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      await saveNewWordFromModal();
    });
  }

  if (backdrop.dataset.bound !== 'true') {
    backdrop.dataset.bound = 'true';
    backdrop.addEventListener('click', (event) => {
      if (event.target !== backdrop) return;
      setNewCardModalOpen(false);
    });
  }

  if (document.body.dataset.reviewModalEscBound !== 'true') {
    document.body.dataset.reviewModalEscBound = 'true';
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (backdrop.classList.contains('hidden')) return;
      setNewCardModalOpen(false);
    });
  }
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
