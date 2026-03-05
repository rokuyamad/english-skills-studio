import { createDraftCard, normalizeEnglishWord } from './srs-api.js';

function removeSelection() {
  const selection = window.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
}

function ensureButton() {
  let btn = document.getElementById('srsQuickAddBtn');
  if (btn) return btn;

  btn = document.createElement('button');
  btn.id = 'srsQuickAddBtn';
  btn.className = 'srs-quick-add-btn hidden';
  btn.type = 'button';
  btn.textContent = 'SRS追加';
  document.body.appendChild(btn);
  return btn;
}

function ensureToast() {
  let toast = document.getElementById('srsQuickAddToast');
  if (toast) return toast;

  toast = document.createElement('p');
  toast.id = 'srsQuickAddToast';
  toast.className = 'srs-quick-add-toast hidden';
  document.body.appendChild(toast);
  return toast;
}

export function initSelectionQuickAdd({ containerId }) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const button = ensureButton();
  const toast = ensureToast();
  let currentWord = '';
  let toastTimer = null;
  let busy = false;

  function hideButton() {
    currentWord = '';
    button.classList.add('hidden');
  }

  function showToast(message, isError = false) {
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.classList.remove('hidden');
    toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 1800);
  }

  function selectionWordInContainer() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
    const raw = selection.toString();
    const normalized = normalizeEnglishWord(raw);
    if (!normalized) return null;

    const range = selection.getRangeAt(0);
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    if (!anchorNode || !focusNode) return null;
    if (!container.contains(anchorNode) || !container.contains(focusNode)) return null;

    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width <= 0 && rect.height <= 0)) return null;
    return { normalized, rect };
  }

  function showButton(rect, word) {
    currentWord = word;
    const top = Math.max(12, window.scrollY + rect.top - 40);
    const left = Math.min(window.innerWidth - 108, Math.max(12, window.scrollX + rect.left));
    button.style.top = `${top}px`;
    button.style.left = `${left}px`;
    button.classList.remove('hidden');
  }

  function handleSelectionChange() {
    if (busy) return;
    const result = selectionWordInContainer();
    if (!result) {
      hideButton();
      return;
    }
    showButton(result.rect, result.normalized);
  }

  button.addEventListener('mousedown', (event) => {
    // Keep selection when clicking the floating action button.
    event.preventDefault();
  });

  button.addEventListener('click', async () => {
    if (busy || !currentWord) return;
    busy = true;
    button.disabled = true;

    try {
      const result = await createDraftCard({ termEn: currentWord });
      if (result.result === 'duplicate') {
        showToast(`「${result.termEn}」は既に登録済みです。`);
      } else {
        showToast(`「${result.termEn}」を下書きカードに追加しました。`);
      }
    } catch (error) {
      console.error(error);
      showToast('SRS追加に失敗しました。', true);
    } finally {
      busy = false;
      button.disabled = false;
      hideButton();
      removeSelection();
    }
  });

  document.addEventListener('selectionchange', handleSelectionChange);
  window.addEventListener('scroll', hideButton, true);
  window.addEventListener('resize', hideButton);
}
