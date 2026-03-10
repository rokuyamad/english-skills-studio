import { recordStudyEvent } from './progress-db.js';
import { flushStudyEvents } from './study-sync.js';

function todayDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function minutesLabel(minutes) {
  if (minutes < 60) return `${minutes}分`;
  const h = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${h}時間` : `${h}時間${rem}分`;
}

function renderEntries(listEl, events) {
  if (!listEl) return;
  listEl.innerHTML = '';
  const items = [...events]
    .sort((a, b) => {
      const at = new Date(a.occurredAt || a.occurred_at).getTime();
      const bt = new Date(b.occurredAt || b.occurred_at).getTime();
      return bt - at;
    })
    .slice(0, 10);

  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'external-log-empty';
    li.textContent = '記録はまだありません';
    listEl.appendChild(li);
    return;
  }

  items.forEach((ev) => {
    const date = (ev.occurredAt || ev.occurred_at || '').slice(0, 10);
    const minutes = Math.round((Number(ev.estimatedSeconds || ev.estimated_seconds) || 0) / 60);
    const memo = ev.contentKey || ev.content_key || '';
    const li = document.createElement('li');
    li.className = 'external-log-entry';
    const dateSpan = document.createElement('span');
    dateSpan.className = 'ext-entry-date';
    dateSpan.textContent = date;
    const durSpan = document.createElement('span');
    durSpan.className = 'ext-entry-duration';
    durSpan.textContent = minutesLabel(minutes);
    li.appendChild(dateSpan);
    li.appendChild(durSpan);
    if (memo) {
      const memoSpan = document.createElement('span');
      memoSpan.className = 'ext-entry-memo';
      memoSpan.textContent = memo;
      li.appendChild(memoSpan);
    }
    listEl.appendChild(li);
  });
}

export function mountExternalLogSection({ scope, getExternalEvents, onSaved }) {
  if (!scope) return;

  const form = scope.querySelector('#externalLogForm');
  const minutesEl = scope.querySelector('#extMinutes');
  const dateEl = scope.querySelector('#extDate');
  const memoEl = scope.querySelector('#extMemo');
  const statusEl = scope.querySelector('#extStatus');
  const listEl = scope.querySelector('#externalLogEntries');

  if (!form || !minutesEl || !dateEl) return;

  // Set defaults
  if (dateEl && !dateEl.value) {
    dateEl.value = todayDateString();
  }

  // Initial render of existing entries
  renderEntries(listEl, getExternalEvents());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const minutes = parseInt(minutesEl.value, 10);
    const date = dateEl.value;
    const memo = (memoEl?.value || '').trim().slice(0, 120);

    if (!date || !minutes || minutes < 1) {
      if (statusEl) {
        statusEl.textContent = '日付と学習時間を入力してください';
        statusEl.style.color = 'var(--danger, #ff8f8f)';
      }
      return;
    }

    const submitBtn = scope.querySelector('#extSubmitBtn');
    if (submitBtn) submitBtn.disabled = true;
    if (statusEl) {
      statusEl.textContent = '記録中...';
      statusEl.style.color = '';
    }

    try {
      const event = {
        id: crypto.randomUUID(),
        occurredAt: `${date}T12:00:00.000Z`,
        pageKey: 'external',
        contentKey: memo || null,
        unitCount: 1,
        estimatedSeconds: minutes * 60,
        source: 'manual',
        syncStatus: 'pending'
      };

      await recordStudyEvent(event);
      await flushStudyEvents();

      if (memoEl) memoEl.value = '';
      dateEl.value = todayDateString();

      if (statusEl) {
        statusEl.textContent = '記録しました';
        statusEl.style.color = 'var(--ok, #6cf1bb)';
        setTimeout(() => {
          if (statusEl) statusEl.textContent = '';
        }, 2000);
      }

      await onSaved();
      renderEntries(listEl, getExternalEvents());
    } catch (err) {
      console.error('[external-log] save failed', err);
      if (statusEl) {
        statusEl.textContent = '保存に失敗しました。もう一度お試しください。';
        statusEl.style.color = 'var(--danger, #ff8f8f)';
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  return {
    refresh: () => renderEntries(listEl, getExternalEvents())
  };
}
