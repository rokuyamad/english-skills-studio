import { recordStudyEvent } from './progress-db.js';
import { flushStudyEvents, removeStudyEvent, updateStudyEvent } from './study-sync.js';

const MINUTE_OPTIONS = [15, 30, 45, 60, 90, 120];

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

function getEventDate(ev) {
  return String(ev?.occurredAt || ev?.occurred_at || '').slice(0, 10);
}

function getEventMinutes(ev) {
  return Math.round((Number(ev?.estimatedSeconds || ev?.estimated_seconds) || 0) / 60);
}

function getEventMemo(ev) {
  return String(ev?.contentKey || ev?.content_key || '');
}

function setStatus(statusEl, message, color = '') {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = color;
}

function buildMinuteSelect(selectedMinutes) {
  const select = document.createElement('select');
  select.className = 'ext-inline-select';

  const options = new Set(MINUTE_OPTIONS);
  if (selectedMinutes > 0) options.add(selectedMinutes);

  [...options]
    .sort((a, b) => a - b)
    .forEach((minutes) => {
      const option = document.createElement('option');
      option.value = String(minutes);
      option.textContent = minutesLabel(minutes);
      option.selected = minutes === selectedMinutes;
      select.appendChild(option);
    });

  return select;
}

function renderEntries(listEl, events, handlers) {
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
    const id = String(ev.id || '');
    const isEditing = handlers.editingId === id;
    const li = document.createElement('li');
    li.className = `external-log-entry${isEditing ? ' is-editing' : ''}`;

    if (isEditing) {
      const dateInput = document.createElement('input');
      dateInput.className = 'ext-inline-date';
      dateInput.type = 'date';
      dateInput.value = getEventDate(ev);

      const minuteSelect = buildMinuteSelect(getEventMinutes(ev));
      const memoInput = document.createElement('input');
      memoInput.className = 'ext-inline-memo';
      memoInput.type = 'text';
      memoInput.maxLength = 120;
      memoInput.placeholder = 'メモ (任意)';
      memoInput.value = getEventMemo(ev);

      const actions = document.createElement('div');
      actions.className = 'ext-entry-actions';

      const saveBtn = document.createElement('button');
      saveBtn.className = 'ext-entry-btn primary';
      saveBtn.type = 'button';
      saveBtn.textContent = '保存';
      saveBtn.addEventListener('click', () => {
        handlers.onSave(ev, {
          date: dateInput.value,
          minutes: parseInt(minuteSelect.value, 10),
          memo: memoInput.value
        });
      });

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'ext-entry-btn';
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'キャンセル';
      cancelBtn.addEventListener('click', () => handlers.onCancel());

      actions.append(saveBtn, cancelBtn);
      li.append(dateInput, minuteSelect, memoInput, actions);
      listEl.appendChild(li);
      return;
    }

    const dateSpan = document.createElement('span');
    dateSpan.className = 'ext-entry-date';
    dateSpan.textContent = getEventDate(ev);

    const durSpan = document.createElement('span');
    durSpan.className = 'ext-entry-duration';
    durSpan.textContent = minutesLabel(getEventMinutes(ev));

    const memoSpan = document.createElement('span');
    memoSpan.className = 'ext-entry-memo';
    memoSpan.textContent = getEventMemo(ev);

    const actions = document.createElement('div');
    actions.className = 'ext-entry-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'ext-entry-btn';
    editBtn.type = 'button';
    editBtn.textContent = '編集';
    editBtn.addEventListener('click', () => handlers.onEdit(id));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'ext-entry-btn danger';
    deleteBtn.type = 'button';
    deleteBtn.textContent = '削除';
    deleteBtn.addEventListener('click', () => handlers.onDelete(ev));

    actions.append(editBtn, deleteBtn);
    li.append(dateSpan, durSpan, memoSpan, actions);
    listEl.appendChild(li);
  });
}

export function mountExternalLogSection({ scope, getExternalEvents, onSaved }) {
  if (!scope) return null;

  const form = scope.querySelector('#externalLogForm');
  const minutesEl = scope.querySelector('#extMinutes');
  const dateEl = scope.querySelector('#extDate');
  const memoEl = scope.querySelector('#extMemo');
  const statusEl = scope.querySelector('#extStatus');
  const listEl = scope.querySelector('#externalLogEntries');

  if (!form || !minutesEl || !dateEl || !listEl) return null;

  const state = {
    editingId: null,
    busy: false
  };

  function getEvents() {
    return Array.isArray(getExternalEvents?.()) ? getExternalEvents() : [];
  }

  function rerender() {
    renderEntries(listEl, getEvents(), {
      editingId: state.editingId,
      onEdit: (id) => {
        if (state.busy) return;
        state.editingId = id;
        rerender();
      },
      onCancel: () => {
        if (state.busy) return;
        state.editingId = null;
        setStatus(statusEl, '');
        rerender();
      },
      onSave: async (originalEvent, values) => {
        if (state.busy) return;

        const safeMinutes = parseInt(values.minutes, 10);
        const safeDate = String(values.date || '');
        const safeMemo = String(values.memo || '').trim().slice(0, 120);
        if (!safeDate || !safeMinutes || safeMinutes < 1) {
          setStatus(statusEl, '日付と学習時間を入力してください', 'var(--danger, #ff8f8f)');
          return;
        }

        state.busy = true;
        setStatus(statusEl, '更新中...');
        try {
          await updateStudyEvent({
            id: originalEvent.id,
            occurredAt: `${safeDate}T12:00:00.000Z`,
            pageKey: 'external',
            contentKey: safeMemo,
            unitCount: Number(originalEvent.unitCount || originalEvent.unit_count || 1) || 1,
            estimatedSeconds: safeMinutes * 60,
            source: originalEvent.source || 'manual'
          });

          state.editingId = null;
          setStatus(statusEl, '更新しました', 'var(--ok, #6cf1bb)');
          await onSaved();
          rerender();
        } catch (error) {
          console.error('[external-log] update failed', error);
          setStatus(statusEl, '更新に失敗しました。通信状態を確認してください。', 'var(--danger, #ff8f8f)');
        } finally {
          state.busy = false;
        }
      },
      onDelete: async (event) => {
        if (state.busy) return;
        const confirmed = window.confirm('この外部学習ログを削除しますか？');
        if (!confirmed) return;

        state.busy = true;
        setStatus(statusEl, '削除中...');
        try {
          await removeStudyEvent(event.id);
          if (state.editingId === event.id) state.editingId = null;
          setStatus(statusEl, '削除しました', 'var(--ok, #6cf1bb)');
          await onSaved();
          rerender();
        } catch (error) {
          console.error('[external-log] delete failed', error);
          setStatus(statusEl, '削除に失敗しました。通信状態を確認してください。', 'var(--danger, #ff8f8f)');
        } finally {
          state.busy = false;
        }
      }
    });
  }

  if (!dateEl.value) {
    dateEl.value = todayDateString();
  }

  rerender();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const minutes = parseInt(minutesEl.value, 10);
    const date = dateEl.value;
    const memo = (memoEl?.value || '').trim().slice(0, 120);

    if (!date || !minutes || minutes < 1) {
      setStatus(statusEl, '日付と学習時間を入力してください', 'var(--danger, #ff8f8f)');
      return;
    }

    const submitBtn = scope.querySelector('#extSubmitBtn');
    if (submitBtn) submitBtn.disabled = true;
    state.busy = true;
    setStatus(statusEl, '記録中...');

    try {
      const event = {
        id: crypto.randomUUID(),
        occurredAt: `${date}T12:00:00.000Z`,
        pageKey: 'external',
        contentKey: memo || '',
        unitCount: 1,
        estimatedSeconds: minutes * 60,
        source: 'manual',
        syncStatus: 'pending'
      };

      await recordStudyEvent(event);
      await flushStudyEvents();

      if (memoEl) memoEl.value = '';
      dateEl.value = todayDateString();
      setStatus(statusEl, '記録しました', 'var(--ok, #6cf1bb)');

      await onSaved();
      rerender();
    } catch (error) {
      console.error('[external-log] save failed', error);
      setStatus(statusEl, '保存に失敗しました。もう一度お試しください。', 'var(--danger, #ff8f8f)');
    } finally {
      state.busy = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  return {
    refresh: () => rerender()
  };
}
