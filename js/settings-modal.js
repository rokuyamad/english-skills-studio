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

function setStatus(statusEl, message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#ff8f8f' : '#d2dbef';
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
      shadowing: Number(getEl(scope, ids.secShadowing)?.value)
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
  const saveBtn = getEl(scope, ids.saveBtn);
  const resetBtn = getEl(scope, ids.resetBtn);
  const statusEl = getEl(scope, ids.status);
  if (!saveBtn || !resetBtn) {
    return {
      reload: async () => {}
    };
  }

  const reload = async () => {
    const current = await getEffectiveStudySettings();
    fillForm(scope, ids, current);
  };

  await reload();

  if (saveBtn.dataset.bound !== 'true') {
    saveBtn.dataset.bound = 'true';
    saveBtn.addEventListener('click', async () => {
      try {
        const next = formToSettings(scope, ids);
        const localSaved = saveStudySettingsLocal(next);
        try {
          await saveStudySettingsRemote(localSaved);
        } catch (error) {
          console.error(error);
          setStatus(statusEl, 'ローカル保存のみ完了（同期は保留）');
          emitSettingsChange();
          onSaved(localSaved);
          return;
        }
        emitSettingsChange();
        onSaved(localSaved);
        setStatus(statusEl, '設定を保存しました');
      } catch (error) {
        console.error(error);
        setStatus(statusEl, '保存に失敗しました', true);
      }
    });
  }

  if (resetBtn.dataset.bound !== 'true') {
    resetBtn.dataset.bound = 'true';
    resetBtn.addEventListener('click', () => {
      fillForm(scope, ids, DEFAULT_STUDY_SETTINGS);
      setStatus(statusEl, 'デフォルト値を入力しました。保存すると反映されます。');
    });
  }

  return { reload };
}
