import { inferCardType, saveSrsCard } from './srs-api.js';

const IDS = {
  backdrop: 'srsDraftModalBackdrop',
  term: 'srsDraftTermInput',
  type: 'srsDraftTypeInput',
  termJa: 'srsDraftTermJaInput',
  exampleEn: 'srsDraftExampleEnInput',
  exampleJa: 'srsDraftExampleJaInput',
  error: 'srsDraftModalError',
  save: 'srsDraftSaveBtn',
  cancel: 'srsDraftCancelBtn'
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
    <section class="review-modal review-modal-wide" role="dialog" aria-modal="true" aria-labelledby="srsDraftModalTitle">
      <h2 class="review-modal-title" id="srsDraftModalTitle">新しいSRSカードを追加</h2>
      <p class="review-modal-copy">単語でも複数語フレーズでも登録できます。意味や例文が揃っていれば、そのまま復習対象にします。</p>
      <div class="review-modal-grid">
        <div class="review-modal-field review-modal-field-wide">
          <label class="review-modal-label" for="${IDS.term}">Expression</label>
          <input class="review-modal-input" id="${IDS.term}" type="text" autocomplete="off" placeholder="e.g. social media / take care of">
        </div>
        <div class="review-modal-field">
          <label class="review-modal-label" for="${IDS.type}">Type</label>
          <select class="review-modal-input review-modal-select" id="${IDS.type}">
            <option value="word">Word</option>
            <option value="phrase">Phrase</option>
            <option value="idiom">Idiom</option>
          </select>
        </div>
        <div class="review-modal-field review-modal-field-wide">
          <label class="review-modal-label" for="${IDS.termJa}">Meaning (JA)</label>
          <input class="review-modal-input" id="${IDS.termJa}" type="text" autocomplete="off" placeholder="日本語の意味">
        </div>
        <div class="review-modal-field review-modal-field-wide">
          <label class="review-modal-label" for="${IDS.exampleEn}">Example (EN)</label>
          <textarea class="review-modal-input review-modal-textarea" id="${IDS.exampleEn}" rows="4" placeholder="English example sentence"></textarea>
        </div>
        <div class="review-modal-field review-modal-field-wide">
          <label class="review-modal-label" for="${IDS.exampleJa}">Example (JA)</label>
          <textarea class="review-modal-input review-modal-textarea" id="${IDS.exampleJa}" rows="4" placeholder="例文の和訳"></textarea>
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

  const termInput = getEl(IDS.term);
  const typeInput = getEl(IDS.type);
  const saveBtn = getEl(IDS.save);
  const cancelBtn = getEl(IDS.cancel);

  if (termInput && typeInput) {
    typeInput.dataset.auto = 'true';
    termInput.addEventListener('input', () => {
      if (typeInput.dataset.auto !== 'true') return;
      typeInput.value = inferCardType(termInput.value);
    });
    typeInput.addEventListener('change', () => {
      typeInput.dataset.auto = 'false';
    });
  }

  if (saveBtn) saveBtn.addEventListener('click', handleSave);
  if (cancelBtn) cancelBtn.addEventListener('click', () => closeSrsDraftModal());
  backdrop.addEventListener('click', (event) => {
    if (event.target !== backdrop || modalState.busy) return;
    closeSrsDraftModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modalState.isOpen && !modalState.busy) {
      closeSrsDraftModal();
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
    termEn: getEl(IDS.term)?.value || '',
    cardType: getEl(IDS.type)?.value || 'word',
    termJa: getEl(IDS.termJa)?.value || '',
    exampleEn: getEl(IDS.exampleEn)?.value || '',
    exampleJa: getEl(IDS.exampleJa)?.value || ''
  };
}

async function handleSave() {
  if (modalState.busy) return;
  setBusy(true);
  setError('');
  try {
    const result = await saveSrsCard(collectValues());
    const onSaved = modalState.onSaved;
    closeSrsDraftModal();
    if (typeof onSaved === 'function') {
      await onSaved(result);
    }
  } catch (error) {
    console.error(error);
    setError(error instanceof Error ? error.message : 'SRSカードの保存に失敗しました。');
  } finally {
    setBusy(false);
  }
}

export function closeSrsDraftModal() {
  const backdrop = getEl(IDS.backdrop);
  if (!backdrop) return;
  modalState.isOpen = false;
  modalState.onSaved = null;
  backdrop.classList.add('hidden');
}

export function openSrsDraftModal({ initialValues = {}, onSaved = null } = {}) {
  ensureModal();

  const backdrop = getEl(IDS.backdrop);
  const termInput = getEl(IDS.term);
  const typeInput = getEl(IDS.type);
  const termJaInput = getEl(IDS.termJa);
  const exampleEnInput = getEl(IDS.exampleEn);
  const exampleJaInput = getEl(IDS.exampleJa);

  if (!backdrop || !termInput || !typeInput || !termJaInput || !exampleEnInput || !exampleJaInput) return;

  termInput.value = initialValues.termEn || '';
  termJaInput.value = initialValues.termJa || '';
  exampleEnInput.value = initialValues.exampleEn || '';
  exampleJaInput.value = initialValues.exampleJa || '';
  typeInput.dataset.auto = initialValues.cardType ? 'false' : 'true';
  typeInput.value = initialValues.cardType || inferCardType(termInput.value);

  modalState.onSaved = onSaved;
  modalState.isOpen = true;
  setBusy(false);
  setError('');
  backdrop.classList.remove('hidden');
  termInput.focus();
  termInput.select();
}
