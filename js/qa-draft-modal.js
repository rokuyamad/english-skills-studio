import { saveQaCard } from './qa-api.js';

const IDS = {
  backdrop: 'qaDraftModalBackdrop',
  question: 'qaDraftQuestion',
  questionJa: 'qaDraftQuestionJa',
  hint: 'qaDraftHint',
  answerEn: 'qaDraftAnswerEn',
  answerJa: 'qaDraftAnswerJa',
  error: 'qaDraftError',
  save: 'qaDraftSaveBtn',
  cancel: 'qaDraftCancelBtn'
};

const modalState = {
  isOpen: false,
  busy: false,
  onSaved: null
};

function getEl(id) {
  return document.getElementById(id);
}

function ensureModal() {
  if (getEl(IDS.backdrop)) return;

  const backdrop = document.createElement('div');
  backdrop.id = IDS.backdrop;
  backdrop.className = 'review-modal-backdrop hidden';
  backdrop.innerHTML = `
    <section class="review-modal review-modal-wide" role="dialog" aria-modal="true" aria-labelledby="qaDraftModalTitle">
      <h2 class="review-modal-title" id="qaDraftModalTitle">新しい QA カードを追加</h2>
      <p class="review-modal-copy">日本語の質問を見て英語で答えるカードを登録します。Hint には使える構文パターンを書くと練習に役立ちます。</p>
      <div class="review-modal-grid" style="grid-template-columns: minmax(0, 1fr);">
        <div class="review-modal-field">
          <label class="review-modal-label" for="${IDS.questionJa}">Question (JA) *</label>
          <input class="review-modal-input" id="${IDS.questionJa}" type="text" autocomplete="off" placeholder="例: あなたの会社はどのようなサービスを提供していますか？">
        </div>
        <div class="review-modal-field">
          <label class="review-modal-label" for="${IDS.question}">Question (EN / reference) *</label>
          <input class="review-modal-input" id="${IDS.question}" type="text" autocomplete="off" placeholder="e.g. What services does your company provide?">
        </div>
        <div class="review-modal-field">
          <label class="review-modal-label" for="${IDS.hint}">Hint — 使える構文パターン (任意)</label>
          <input class="review-modal-input" id="${IDS.hint}" type="text" autocomplete="off" placeholder="e.g. provide A such as B / such as + 動名詞">
        </div>
        <div class="review-modal-field">
          <label class="review-modal-label" for="${IDS.answerEn}">Model Answer (EN) *</label>
          <textarea class="review-modal-input review-modal-textarea" id="${IDS.answerEn}" rows="4" placeholder="English model answer"></textarea>
        </div>
        <div class="review-modal-field">
          <label class="review-modal-label" for="${IDS.answerJa}">Context (JA) — 補足・解説 (任意)</label>
          <textarea class="review-modal-input review-modal-textarea" id="${IDS.answerJa}" rows="3" placeholder="日本語での補足や解説（任意）"></textarea>
        </div>
      </div>
      <p class="review-modal-error hidden" id="${IDS.error}"></p>
      <div class="review-modal-actions">
        <button class="review-modal-cancel" id="${IDS.cancel}" type="button">Cancel</button>
        <button class="review-modal-save" id="${IDS.save}" type="button">Save</button>
      </div>
    </section>
  `;
  document.body.appendChild(backdrop);

  const saveBtn = getEl(IDS.save);
  const cancelBtn = getEl(IDS.cancel);

  if (saveBtn) saveBtn.addEventListener('click', handleSave);
  if (cancelBtn) cancelBtn.addEventListener('click', () => closeQaDraftModal());
  backdrop.addEventListener('click', (event) => {
    if (event.target !== backdrop || modalState.busy) return;
    closeQaDraftModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modalState.isOpen && !modalState.busy) {
      closeQaDraftModal();
    }
  });
}

function setError(message = '') {
  const errorEl = getEl(IDS.error);
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.classList.toggle('hidden', !message);
}

function setBusy(isBusy) {
  modalState.busy = Boolean(isBusy);
  const saveBtn = getEl(IDS.save);
  const cancelBtn = getEl(IDS.cancel);
  if (saveBtn) saveBtn.disabled = modalState.busy;
  if (cancelBtn) cancelBtn.disabled = modalState.busy;
}

function collectValues() {
  return {
    question: getEl(IDS.question)?.value || '',
    questionJa: getEl(IDS.questionJa)?.value || '',
    hint: getEl(IDS.hint)?.value || '',
    answerEn: getEl(IDS.answerEn)?.value || '',
    answerJa: getEl(IDS.answerJa)?.value || ''
  };
}

async function handleSave() {
  if (modalState.busy) return;
  setBusy(true);
  setError('');
  try {
    const result = await saveQaCard(collectValues());
    const onSaved = modalState.onSaved;
    closeQaDraftModal();
    if (typeof onSaved === 'function') {
      await onSaved(result);
    }
  } catch (error) {
    console.error(error);
    setError(error instanceof Error ? error.message : 'カードの保存に失敗しました。');
  } finally {
    setBusy(false);
  }
}

export function closeQaDraftModal() {
  const backdrop = getEl(IDS.backdrop);
  if (!backdrop) return;
  modalState.isOpen = false;
  modalState.onSaved = null;
  backdrop.classList.add('hidden');
}

export function openQaDraftModal({ onSaved = null } = {}) {
  ensureModal();

  const backdrop = getEl(IDS.backdrop);
  const questionInput = getEl(IDS.question);
  const questionJaInput = getEl(IDS.questionJa);
  const hintInput = getEl(IDS.hint);
  const answerEnInput = getEl(IDS.answerEn);
  const answerJaInput = getEl(IDS.answerJa);

  if (!backdrop || !questionInput || !questionJaInput) return;

  questionInput.value = '';
  questionJaInput.value = '';
  if (hintInput) hintInput.value = '';
  if (answerEnInput) answerEnInput.value = '';
  if (answerJaInput) answerJaInput.value = '';

  modalState.onSaved = onSaved;
  modalState.isOpen = true;
  setBusy(false);
  setError('');
  backdrop.classList.remove('hidden');
  questionJaInput.focus();
}
