import { getSessionUser, getSupabaseClient } from './auth.js';
import { getKv, setKv } from './progress-db.js';

const LOCAL_KEY = 'study-settings:v1';
let cachedSettings = null;

export const DEFAULT_STUDY_SETTINGS = {
  version: 1,
  goal_hours: 1000,
  external_carryover_hours: 0,
  external_carryover_note: '',
  seconds_per_count: {
    imitation: 45,
    slash: 75,
    shadowing: 120,
    srs: 60
  },
  streak_min_minutes_per_day: 10,
  xp_per_minute: 10,
  milestones_hours: [100, 300, 600, 1000],
  level_curve_factor: 120,
  timezone: 'Asia/Tokyo',
  updated_at: new Date(0).toISOString()
};

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeMilestones(input, goalHours) {
  const arr = Array.isArray(input) ? input : [];
  const clean = [...new Set(arr.map((n) => Math.round(Number(n))).filter((n) => Number.isFinite(n) && n > 0))]
    .sort((a, b) => a - b)
    .slice(0, 8);
  if (!clean.length) {
    return [Math.round(goalHours * 0.1), Math.round(goalHours * 0.3), Math.round(goalHours * 0.6), Math.round(goalHours)].filter((v, i, src) => v > 0 && src.indexOf(v) === i).sort((a, b) => a - b);
  }
  return clean;
}

export function validateStudySettings(raw = {}) {
  const goalHours = clampNumber(raw.goal_hours, 10, 5000, DEFAULT_STUDY_SETTINGS.goal_hours);
  const secondsPerCount = raw.seconds_per_count || {};
  const externalCarryoverNote = typeof raw.external_carryover_note === 'string'
    ? raw.external_carryover_note.trim().slice(0, 120)
    : DEFAULT_STUDY_SETTINGS.external_carryover_note;

  const settings = {
    version: 1,
    goal_hours: goalHours,
    external_carryover_hours: clampNumber(raw.external_carryover_hours, 0, 20000, DEFAULT_STUDY_SETTINGS.external_carryover_hours),
    external_carryover_note: externalCarryoverNote,
    seconds_per_count: {
      imitation: clampNumber(secondsPerCount.imitation, 10, Number.POSITIVE_INFINITY, DEFAULT_STUDY_SETTINGS.seconds_per_count.imitation),
      slash: clampNumber(secondsPerCount.slash, 10, Number.POSITIVE_INFINITY, DEFAULT_STUDY_SETTINGS.seconds_per_count.slash),
      shadowing: clampNumber(secondsPerCount.shadowing, 10, Number.POSITIVE_INFINITY, DEFAULT_STUDY_SETTINGS.seconds_per_count.shadowing),
      srs: clampNumber(secondsPerCount.srs, 10, Number.POSITIVE_INFINITY, DEFAULT_STUDY_SETTINGS.seconds_per_count.srs)
    },
    streak_min_minutes_per_day: clampNumber(
      raw.streak_min_minutes_per_day,
      1,
      180,
      DEFAULT_STUDY_SETTINGS.streak_min_minutes_per_day
    ),
    xp_per_minute: clampNumber(raw.xp_per_minute, 1, 100, DEFAULT_STUDY_SETTINGS.xp_per_minute),
    milestones_hours: normalizeMilestones(raw.milestones_hours, goalHours),
    level_curve_factor: clampNumber(raw.level_curve_factor, 10, 1000, DEFAULT_STUDY_SETTINGS.level_curve_factor),
    timezone: typeof raw.timezone === 'string' && raw.timezone.trim() ? raw.timezone.trim() : DEFAULT_STUDY_SETTINGS.timezone,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : new Date().toISOString()
  };

  return settings;
}

function readLocalStorage() {
  try {
    const txt = localStorage.getItem(LOCAL_KEY);
    if (!txt) return null;
    return JSON.parse(txt);
  } catch (_) {
    return null;
  }
}

function writeLocalStorage(settings) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(settings));
  } catch (_) {
    // ignore quota errors
  }
}

export function loadStudySettingsLocal() {
  const raw = readLocalStorage();
  if (!raw) return null;
  return validateStudySettings(raw);
}

export function saveStudySettingsLocal(nextSettings) {
  const settings = validateStudySettings({ ...nextSettings, updated_at: new Date().toISOString() });
  writeLocalStorage(settings);
  cachedSettings = settings;
  return settings;
}

export async function loadStudySettingsRemote() {
  const user = await getSessionUser();
  const supabase = await getSupabaseClient();
  if (!user || !supabase) return null;

  const { data, error } = await supabase
    .from('study_user_settings')
    .select('settings, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data?.settings) return null;
  return validateStudySettings({ ...data.settings, updated_at: data.updated_at || data.settings.updated_at });
}

export async function saveStudySettingsRemote(nextSettings) {
  const user = await getSessionUser();
  const supabase = await getSupabaseClient();
  if (!user || !supabase) return null;

  const settings = validateStudySettings({ ...nextSettings, updated_at: new Date().toISOString() });
  const { error } = await supabase
    .from('study_user_settings')
    .upsert({ user_id: user.id, settings, updated_at: settings.updated_at }, { onConflict: 'user_id' });

  if (error) throw error;
  cachedSettings = settings;
  return settings;
}

export async function getEffectiveStudySettings() {
  if (cachedSettings) return cachedSettings;

  const local = loadStudySettingsLocal();
  const remote = await loadStudySettingsRemote();

  const resolved = (() => {
    if (remote && local) {
      return new Date(remote.updated_at).getTime() >= new Date(local.updated_at).getTime() ? remote : local;
    }
    if (remote) return remote;
    if (local) return local;
    return DEFAULT_STUDY_SETTINGS;
  })();

  const safe = validateStudySettings(resolved);
  saveStudySettingsLocal(safe);
  await setKv('study-settings-cache', safe);
  cachedSettings = safe;
  return safe;
}

export function subscribeSettingsChange(listener) {
  if (typeof listener !== 'function') return () => {};
  const handler = () => listener();
  window.addEventListener('study-settings-changed', handler);
  return () => window.removeEventListener('study-settings-changed', handler);
}

export function emitSettingsChange(nextSettings = null) {
  cachedSettings = nextSettings ? validateStudySettings(nextSettings) : null;
  window.dispatchEvent(new CustomEvent('study-settings-changed', {
    detail: cachedSettings
  }));
}
