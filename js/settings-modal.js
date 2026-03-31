import {
  DEFAULT_STUDY_SETTINGS,
  emitSettingsChange,
  getEffectiveStudySettings,
  saveStudySettingsLocal,
  saveStudySettingsRemote,
  validateStudySettings
} from './study-settings.js';

function parseMilestones(text) {
  return String(text || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

function getEl(scope, id) {
  return scope.querySelector(`#${id}`);
}

function setStatus(statusEl, message, tone = 'neutral') {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
}

function normalizeComparableSettings(settings) {
  const safe = validateStudySettings(settings);
  return JSON.stringify({
    ...safe,
    updated_at: null
  });
}

function isSameSettings(a, b) {
  if (!a || !b) return false;
  return normalizeComparableSettings(a) === normalizeComparableSettings(b);
}

function formatSavedAt(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function setFormState({
  saveBtn,
  resetBtn,
  statusEl,
  stateBadgeEl,
  stateCopyEl,
  busy = false,
  dirty = false,
  hasSaved = false,
  savedAt = '',
  syncMode = 'remote'
}) {
  const savedAtLabel = formatSavedAt(savedAt);
  if (saveBtn) {
    saveBtn.disabled = busy;
    saveBtn.dataset.state = busy ? 'busy' : hasSaved && !dirty ? 'saved' : 'idle';
    saveBtn.textContent = busy
      ? '保存中...'
      : hasSaved && !dirty
        ? '反映済み'
        : '保存して反映';
    saveBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
  }

  if (resetBtn) resetBtn.disabled = busy;

  if (stateBadgeEl) {
    const state = busy
      ? 'busy'
      : dirty
        ? 'dirty'
        : hasSaved
          ? 'saved'
          : 'idle';
    stateBadgeEl.dataset.state = state;
    stateBadgeEl.textContent = busy
      ? '保存中'
      : dirty
        ? '未保存の変更'
        : hasSaved
          ? 'ダッシュボードへ反映済み'
          : '現在の設定';
  }

  if (stateCopyEl) {
    if (busy) {
      stateCopyEl.textContent = '学習メトリクスを保存し、ダッシュボードを更新しています。';
    } else if (dirty) {
      stateCopyEl.textContent = 'まだ反映されていません。保存すると背面のダッシュボードへ即時反映されます。';
    } else if (hasSaved) {
      const suffix = savedAtLabel ? ` 最終保存: ${savedAtLabel}` : '';
      stateCopyEl.textContent = syncMode === 'local'
        ? `この端末には保存済みです。オンライン復帰後に同期されます。${suffix}`.trim()
        : `現在の値が反映されています。${suffix}`.trim();
    } else {
      stateCopyEl.textContent = '目標時間、換算秒、レベル計算をここで調整できます。';
    }
  }

  if (statusEl && !statusEl.textContent) {
    statusEl.dataset.tone = 'neutral';
  }
}

function getFormElement(scope) {
  if (scope?.matches?.('form')) return scope;
  return scope?.querySelector?.('[data-settings-form]') || scope?.querySelector?.('form') || null;
}

function getStateElements(scope) {
  return {
    badge: scope.querySelector('[data-settings-state]'),
    copy: scope.querySelector('[data-settings-state-copy]')
  };
}

function bindDirtyTracking(target, onDirtyChange) {
  if (!target?.addEventListener) return;
  if (target.dataset?.settingsDirtyBound === 'true') return;
  if (target.dataset) target.dataset.settingsDirtyBound = 'true';
  const handler = () => onDirtyChange();
  target.addEventListener('input', handler);
  target.addEventListener('change', handler);
}

function formToSettings(scope, ids) {
  return validateStudySettings({
    version: 1,
    goal_hours: Number(getEl(scope, ids.goalHours)?.value),
    external_carryover_hours: Number(getEl(scope, ids.externalCarryoverHours)?.value),
    external_carryover_note: getEl(scope, ids.externalCarryoverNote)?.value,
    seconds_per_count: {
      imitation: Number(getEl(scope, ids.secImitation)?.value),
      slash: Number(getEl(scope, ids.secSlash)?.value),
      shadowing: Number(getEl(scope, ids.secShadowing)?.value),
      srs: Number(getEl(scope, ids.secSrs)?.value)
    },
    streak_min_minutes_per_day: Number(getEl(scope, ids.streakMinutes)?.value),
    xp_per_minute: Number(getEl(scope, ids.xpPerMinute)?.value),
    milestones_hours: parseMilestones(getEl(scope, ids.milestones)?.value),
    level_curve_factor: Number(getEl(scope, ids.levelCurveFactor)?.value),
    timezone: getEl(scope, ids.timezone)?.value
  });
}

function fillForm(scope, ids, settings) {
  getEl(scope, ids.goalHours).value = settings.goal_hours;
  getEl(scope, ids.externalCarryoverHours).value = settings.external_carryover_hours;
  getEl(scope, ids.externalCarryoverNote).value = settings.external_carryover_note || '';
  getEl(scope, ids.secImitation).value = settings.seconds_per_count.imitation;
  getEl(scope, ids.secSlash).value = settings.seconds_per_count.slash;
  getEl(scope, ids.secShadowing).value = settings.seconds_per_count.shadowing;
  getEl(scope, ids.secSrs).value = settings.seconds_per_count.srs;
  getEl(scope, ids.streakMinutes).value = settings.streak_min_minutes_per_day;
  getEl(scope, ids.xpPerMinute).value = settings.xp_per_minute;
  getEl(scope, ids.levelCurveFactor).value = settings.level_curve_factor;
  getEl(scope, ids.milestones).value = settings.milestones_hours.join(',');
  getEl(scope, ids.timezone).value = settings.timezone;
}

export const PAGE_SETTINGS_IDS = {
  goalHours: 'goalHours',
  externalCarryoverHours: 'externalCarryoverHours',
  externalCarryoverNote: 'externalCarryoverNote',
  secImitation: 'secImitation',
  secSlash: 'secSlash',
  secShadowing: 'secShadowing',
  secSrs: 'secSrs',
  streakMinutes: 'streakMinutes',
  xpPerMinute: 'xpPerMinute',
  milestones: 'milestones',
  levelCurveFactor: 'levelCurveFactor',
  timezone: 'timezone',
  saveBtn: 'saveBtn',
  resetBtn: 'resetBtn',
  status: 'settingsStatus'
};

export const MODAL_SETTINGS_IDS = {
  goalHours: 'modalGoalHours',
  externalCarryoverHours: 'modalExternalCarryoverHours',
  externalCarryoverNote: 'modalExternalCarryoverNote',
  secImitation: 'modalSecImitation',
  secSlash: 'modalSecSlash',
  secShadowing: 'modalSecShadowing',
  secSrs: 'modalSecSrs',
  streakMinutes: 'modalStreakMinutes',
  xpPerMinute: 'modalXpPerMinute',
  milestones: 'modalMilestones',
  levelCurveFactor: 'modalLevelCurveFactor',
  timezone: 'modalTimezone',
  saveBtn: 'modalSaveBtn',
  resetBtn: 'modalResetBtn',
  status: 'modalSettingsStatus'
};

export async function mountSettingsForm({
  scope = document,
  ids = PAGE_SETTINGS_IDS,
  onSaved = () => {}
} = {}) {
  const formEl = getFormElement(scope);
  const saveBtn = getEl(scope, ids.saveBtn);
  const resetBtn = getEl(scope, ids.resetBtn);
  const statusEl = getEl(scope, ids.status);
  const stateEls = getStateElements(scope);
  if (!saveBtn || !resetBtn) {
    return {
      reload: async () => {}
    };
  }

  let lastSavedSettings = null;
  let busy = false;
  let dirty = false;
  let lastSyncMode = 'remote';

  const refreshDirtyState = () => {
    const current = formToSettings(scope, ids);
    dirty = !isSameSettings(current, lastSavedSettings);
    if (dirty && statusEl?.dataset.tone === 'success') {
      setStatus(statusEl, '変更があります。保存するとダッシュボードへ反映されます。', 'neutral');
    }
    setFormState({
      saveBtn,
      resetBtn,
      statusEl,
      stateBadgeEl: stateEls.badge,
      stateCopyEl: stateEls.copy,
      busy,
      dirty,
      hasSaved: Boolean(lastSavedSettings),
      savedAt: lastSavedSettings?.updated_at,
      syncMode: lastSyncMode
    });
  };

  const reload = async () => {
    const current = await getEffectiveStudySettings();
    fillForm(scope, ids, current);
    lastSavedSettings = current;
    busy = false;
    dirty = false;
    lastSyncMode = 'remote';
    setStatus(statusEl, '', 'neutral');
    setFormState({
      saveBtn,
      resetBtn,
      statusEl,
      stateBadgeEl: stateEls.badge,
      stateCopyEl: stateEls.copy,
      busy,
      dirty,
      hasSaved: true,
      savedAt: current.updated_at,
      syncMode: lastSyncMode
    });
  };

  await reload();
  bindDirtyTracking(formEl || scope, refreshDirtyState);

  const handleSave = async () => {
    if (busy) return;
    busy = true;
    setStatus(statusEl, '設定を保存しています...', 'neutral');
    setFormState({
      saveBtn,
      resetBtn,
      statusEl,
      stateBadgeEl: stateEls.badge,
      stateCopyEl: stateEls.copy,
      busy,
      dirty,
      hasSaved: Boolean(lastSavedSettings),
      savedAt: lastSavedSettings?.updated_at,
      syncMode: lastSyncMode
    });

    try {
      const next = formToSettings(scope, ids);
      const localSaved = saveStudySettingsLocal(next);
      let savedSettings = localSaved;
      let syncMode = 'remote';
      try {
        const remoteSaved = await saveStudySettingsRemote(localSaved);
        if (remoteSaved) {
          savedSettings = remoteSaved;
        } else {
          syncMode = 'local';
        }
      } catch (error) {
        console.error(error);
        syncMode = 'local';
      }

      emitSettingsChange();
      await onSaved(savedSettings);
      lastSavedSettings = savedSettings;
      lastSyncMode = syncMode;
      dirty = false;
      fillForm(scope, ids, savedSettings);
      setStatus(
        statusEl,
        syncMode === 'local'
          ? 'この端末には保存しました。オンライン復帰後に同期されます。'
          : '保存しました。ダッシュボードへ即時反映しています。',
        syncMode === 'local' ? 'warning' : 'success'
      );
    } catch (error) {
      console.error(error);
      setStatus(statusEl, '保存に失敗しました。入力値または通信状態を確認してください。', 'error');
    } finally {
      busy = false;
      setFormState({
        saveBtn,
        resetBtn,
        statusEl,
        stateBadgeEl: stateEls.badge,
        stateCopyEl: stateEls.copy,
        busy,
        dirty,
        hasSaved: Boolean(lastSavedSettings),
        savedAt: lastSavedSettings?.updated_at,
        syncMode: lastSyncMode
      });
    }
  };

  if (formEl && formEl.dataset.boundSubmit !== 'true') {
    formEl.dataset.boundSubmit = 'true';
    formEl.addEventListener('submit', (event) => {
      event.preventDefault();
      handleSave().catch((error) => console.error(error));
    });
  }

  if (!formEl && saveBtn.dataset.bound !== 'true') {
    saveBtn.dataset.bound = 'true';
    saveBtn.addEventListener('click', () => {
      handleSave().catch((error) => console.error(error));
    });
  }

  if (resetBtn.dataset.bound !== 'true') {
    resetBtn.dataset.bound = 'true';
    resetBtn.addEventListener('click', () => {
      fillForm(scope, ids, DEFAULT_STUDY_SETTINGS);
      setStatus(statusEl, 'デフォルト値を入力しました。保存するとダッシュボードへ反映されます。', 'neutral');
      refreshDirtyState();
    });
  }

  return { reload };
}
