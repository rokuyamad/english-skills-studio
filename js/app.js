import { requireAuthOrRedirect, setupTopbarAuth } from './auth-ui.js';
import { getSessionUser, getSupabaseClient } from './auth.js';
import { initMobileTopbar } from './mobile-topbar.js';
import { initProgressDb, getCountsByPrefix, listStudyEvents } from './progress-db.js';
import { getEffectiveStudySettings, subscribeSettingsChange } from './study-settings.js';
import { flushStudyEvents } from './study-sync.js';
import { computeDashboardSnapshot } from './study-metrics.js';
import { renderDashboard } from './dashboard-ui.js';

let settingsUnsubscribe = null;

async function getCountTotalsByPage() {
  const [imitation, slash, shadowing] = await Promise.all([
    getCountsByPrefix('imitation'),
    getCountsByPrefix('slash'),
    getCountsByPrefix('shadowing')
  ]);

  return {
    imitation: Object.values(imitation).reduce((sum, v) => sum + Number(v || 0), 0),
    slash: Object.values(slash).reduce((sum, v) => sum + Number(v || 0), 0),
    shadowing: Object.values(shadowing).reduce((sum, v) => sum + Number(v || 0), 0)
  };
}

async function fetchRemoteStudyEvents() {
  const user = await getSessionUser();
  const supabase = await getSupabaseClient();
  if (!user || !supabase) return [];

  const { data, error } = await supabase
    .from('study_events')
    .select('id, occurred_at, page_key, content_key, unit_count, estimated_seconds, source')
    .eq('user_id', user.id)
    .order('occurred_at', { ascending: false })
    .limit(5000);

  if (error || !Array.isArray(data)) {
    console.error('[dashboard] failed to fetch remote events', error);
    return [];
  }

  return data.map((row) => ({
    id: row.id,
    occurredAt: row.occurred_at,
    pageKey: row.page_key,
    contentKey: row.content_key,
    unitCount: row.unit_count,
    estimatedSeconds: row.estimated_seconds,
    source: row.source
  }));
}

function mergeEvents(localEvents, remoteEvents) {
  const map = new Map();
  [...remoteEvents, ...localEvents].forEach((event) => {
    if (!event?.id) return;
    map.set(event.id, event);
  });
  return [...map.values()];
}

async function renderDashboardFromData() {
  const settings = await getEffectiveStudySettings();
  const [localEvents, remoteEvents, countTotals] = await Promise.all([
    listStudyEvents(),
    fetchRemoteStudyEvents(),
    getCountTotalsByPage()
  ]);

  const events = mergeEvents(localEvents, remoteEvents);
  const eventUnits = events.reduce((acc, ev) => {
    const key = ev.pageKey || ev.page_key;
    if (!Object.prototype.hasOwnProperty.call(acc, key)) return acc;
    acc[key] += Number(ev.unitCount || ev.unit_count || 1);
    return acc;
  }, { imitation: 0, slash: 0, shadowing: 0 });

  const baselineSecondsByPage = {
    imitation: Math.max(0, countTotals.imitation - eventUnits.imitation) * Number(settings.seconds_per_count.imitation || 45),
    slash: Math.max(0, countTotals.slash - eventUnits.slash) * Number(settings.seconds_per_count.slash || 75),
    shadowing: Math.max(0, countTotals.shadowing - eventUnits.shadowing) * Number(settings.seconds_per_count.shadowing || 120)
  };

  const snapshot = computeDashboardSnapshot({ events, baselineSecondsByPage }, settings);
  renderDashboard(snapshot, settings);
}

function setupDashboardAutoRefresh() {
  if (settingsUnsubscribe) settingsUnsubscribe();

  settingsUnsubscribe = subscribeSettingsChange(() => {
    renderDashboardFromData().catch((e) => console.error(e));
  });

  window.addEventListener('online', () => {
    flushStudyEvents()
      .then(() => renderDashboardFromData())
      .catch((e) => console.error(e));
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    flushStudyEvents()
      .then(() => renderDashboardFromData())
      .catch((e) => console.error(e));
  });
}

async function bootstrap() {
  const isAuthenticated = await requireAuthOrRedirect();
  if (!isAuthenticated) return;

  initMobileTopbar();
  setupTopbarAuth();

  await initProgressDb();
  await flushStudyEvents().catch((e) => console.error(e));

  setupDashboardAutoRefresh();
  await renderDashboardFromData();
}

bootstrap();
