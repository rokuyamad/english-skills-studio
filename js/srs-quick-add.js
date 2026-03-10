import { normalizeEnglishExpression } from './srs-api.js';
import { openSrsDraftModal } from './srs-draft-modal.js';

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

export function initSelectionQuickAdd({ containerId, resolveSelectionContext } = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const button = ensureButton();
  const toast = ensureToast();
  let currentSelection = null;
  let toastTimer = null;
  let busy = false;

  function hideButton() {
    currentSelection = null;
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

  function selectionInContainer() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
    const raw = selection.toString();
    const normalized = normalizeEnglishExpression(raw);
    if (!normalized) return null;

    const range = selection.getRangeAt(0);
    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    if (!anchorNode || !focusNode) return null;
    if (!container.contains(anchorNode) || !container.contains(focusNode)) return null;

    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width <= 0 && rect.height <= 0)) return null;
    return {
      termEn: normalized,
      rawText: raw.trim(),
      rect,
      container,
      commonAncestor: range.commonAncestorContainer
    };
  }

  function showButton(selectionInfo) {
    currentSelection = selectionInfo;
    const { rect } = selectionInfo;
    const top = Math.max(12, window.scrollY + rect.top - 40);
    const left = Math.min(window.innerWidth - 108, Math.max(12, window.scrollX + rect.left));
    button.style.top = `${top}px`;
    button.style.left = `${left}px`;
    button.classList.remove('hidden');
  }

  function handleSelectionChange() {
    if (busy) return;
    const result = selectionInContainer();
    if (!result) {
      hideButton();
      return;
    }
    showButton(result);
  }

  button.addEventListener('mousedown', (event) => {
    // Keep selection when clicking the floating action button.
    event.preventDefault();
  });

  button.addEventListener('click', async () => {
    if (busy || !currentSelection?.termEn) return;
    busy = true;
    button.disabled = true;

    try {
      const initialValues = typeof resolveSelectionContext === 'function'
        ? await resolveSelectionContext(currentSelection)
        : {};
      const termEn = currentSelection.termEn;
      hideButton();
      removeSelection();
      openSrsDraftModal({
        initialValues: {
          termEn,
          ...(initialValues || {})
        },
        onSaved: async (result) => {
          if (result.result === 'duplicate') {
            showToast(`「${result.termEn}」は既に登録済みです。`);
            return;
          }
          if (result.result === 'updated') {
            showToast(
              result.status === 'ready'
                ? `「${result.termEn}」の既存draftを更新して復習対象にしました。`
                : `「${result.termEn}」の既存draftを更新しました。`
            );
            return;
          }
          showToast(
            result.status === 'ready'
              ? `「${result.termEn}」を追加して復習対象にしました。`
              : `「${result.termEn}」を下書きカードに追加しました。`
          );
        }
      });
    } catch (error) {
      console.error(error);
      showToast('SRS追加に失敗しました。', true);
    } finally {
      busy = false;
      button.disabled = false;
    }
  });

  document.addEventListener('selectionchange', handleSelectionChange);
  window.addEventListener('scroll', hideButton, true);
  window.addEventListener('resize', hideButton);
}
