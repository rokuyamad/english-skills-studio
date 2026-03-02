import { requireAuthOrRedirect, setupTopbarAuth } from './auth-ui.js';
import { initMobileTopbar } from './mobile-topbar.js';
import {
  DEFAULT_STUDY_SETTINGS,
  emitSettingsChange,
  getEffectiveStudySettings,
  saveStudySettingsLocal,
  saveStudySettingsRemote,
  validateStudySettings
} from './study-settings.js';

function setStatus(message, isError = false) {
  const el = document.getElementById('settingsStatus');
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? '#ff8f8f' : '#d2dbef';
}

function parseMilestones(text) {
  return String(text || '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

function formToSettings() {
  return validateStudySettings({
    version: 1,
    goal_hours: Number(document.getElementById('goalHours').value),
    seconds_per_count: {
      imitation: Number(document.getElementById('secImitation').value),
      slash: Number(document.getElementById('secSlash').value),
      shadowing: Number(document.getElementById('secShadowing').value)
    },
    streak_min_minutes_per_day: Number(document.getElementById('streakMinutes').value),
    xp_per_minute: Number(document.getElementById('xpPerMinute').value),
    milestones_hours: parseMilestones(document.getElementById('milestones').value),
    level_curve_factor: Number(document.getElementById('levelCurveFactor').value),
    timezone: document.getElementById('timezone').value
  });
}

function fillForm(settings) {
  document.getElementById('goalHours').value = settings.goal_hours;
  document.getElementById('secImitation').value = settings.seconds_per_count.imitation;
  document.getElementById('secSlash').value = settings.seconds_per_count.slash;
  document.getElementById('secShadowing').value = settings.seconds_per_count.shadowing;
  document.getElementById('streakMinutes').value = settings.streak_min_minutes_per_day;
  document.getElementById('xpPerMinute').value = settings.xp_per_minute;
  document.getElementById('levelCurveFactor').value = settings.level_curve_factor;
  document.getElementById('milestones').value = settings.milestones_hours.join(',');
  document.getElementById('timezone').value = settings.timezone;
}

async function bootstrap() {
  const isAuthenticated = await requireAuthOrRedirect();
  if (!isAuthenticated) return;

  initMobileTopbar();
  setupTopbarAuth();

  const current = await getEffectiveStudySettings();
  fillForm(current);

  const saveBtn = document.getElementById('saveBtn');
  const resetBtn = document.getElementById('resetBtn');

  saveBtn.addEventListener('click', async () => {
    try {
      const next = formToSettings();
      const localSaved = saveStudySettingsLocal(next);
      try {
        await saveStudySettingsRemote(localSaved);
      } catch (e) {
        console.error(e);
        setStatus('ローカル保存のみ完了（同期は保留）');
      }
      emitSettingsChange();
      setStatus('設定を保存しました');
    } catch (e) {
      console.error(e);
      setStatus('保存に失敗しました', true);
    }
  });

  resetBtn.addEventListener('click', () => {
    fillForm(DEFAULT_STUDY_SETTINGS);
    setStatus('デフォルト値を入力しました。保存すると反映されます。');
  });
}

bootstrap();
