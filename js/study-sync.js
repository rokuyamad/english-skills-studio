import { getSessionUser, getSupabaseClient } from './auth.js';
import {
  deleteStudyEvent,
  listPendingStudyEvents,
  markStudyEventsSynced,
  recordStudyEvent
} from './progress-db.js';

let flushInFlight = null;
const COUNTER_SYNC_PAGE_SIZE = 1000;

function buildEstimatedSeconds(pageKey, settings) {
  const map = settings?.seconds_per_count || {};
  const fallback = 60;
  const value = Number(map[pageKey]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function buildStudyEvent({ pageKey, contentKey, settings }) {
  return {
    id: crypto.randomUUID(),
    occurredAt: new Date().toISOString(),
    pageKey,
    contentKey,
    unitCount: 1,
    estimatedSeconds: buildEstimatedSeconds(pageKey, settings),
    source: 'counter',
    syncStatus: 'pending'
  };
}

function aggregateCounterRows(rows, pageKey) {
  const counts = {};
  (rows || []).forEach((row) => {
    const rowPageKey = row.pageKey || row.page_key;
    if (pageKey && rowPageKey !== pageKey) return;
    if ((row.source || 'counter') !== 'counter') return;
    const contentKey = String(row.contentKey || row.content_key || '').trim();
    if (!contentKey) return;
    const unitCount = Math.max(0, Number(row.unitCount || row.unit_count || 0));
    if (!unitCount) return;
    counts[contentKey] = (counts[contentKey] || 0) + unitCount;
  });
  return counts;
}

function mergeCounterMaps(base = {}, extra = {}) {
  const merged = { ...base };
  Object.entries(extra).forEach(([key, value]) => {
    merged[key] = (merged[key] || 0) + Number(value || 0);
  });
  return merged;
}

async function fetchRemoteCounterCounts(pageKey) {
  const user = await getSessionUser();
  const supabase = await getSupabaseClient();
  if (!user || !supabase) return {};

  let from = 0;
  let result = {};

  while (true) {
    const to = from + COUNTER_SYNC_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('study_events')
      .select('content_key, unit_count, page_key, source')
      .eq('user_id', user.id)
      .eq('page_key', pageKey)
      .eq('source', 'counter')
      .range(from, to);

    if (error) throw error;
    result = mergeCounterMaps(result, aggregateCounterRows(data, pageKey));
    if (!Array.isArray(data) || data.length < COUNTER_SYNC_PAGE_SIZE) break;
    from += COUNTER_SYNC_PAGE_SIZE;
  }

  return result;
}

export async function loadCounterCounts(pageKey) {
  const pending = await listPendingStudyEvents(5000);
  const pendingCounts = aggregateCounterRows(pending, pageKey);

  try {
    const remoteCounts = await fetchRemoteCounterCounts(pageKey);
    return mergeCounterMaps(remoteCounts, pendingCounts);
  } catch (error) {
    console.error('[study-sync] counter sync failed', error);
    return pendingCounts;
  }
}

export async function recordAndMaybeFlush(event) {
  await recordStudyEvent(event);
  if (navigator.onLine) {
    flushStudyEvents().catch((e) => console.error('[study-sync] flush failed', e));
  }
}

export async function flushStudyEvents() {
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async () => {
    const user = await getSessionUser();
    const supabase = await getSupabaseClient();
    if (!user || !supabase) return;

    const pending = await listPendingStudyEvents(500);
    if (!pending.length) return;

    const rows = pending.map((ev) => ({
      id: ev.id,
      user_id: user.id,
      occurred_at: ev.occurredAt,
      page_key: ev.pageKey,
      content_key: ev.contentKey ?? '',
      unit_count: ev.unitCount,
      estimated_seconds: ev.estimatedSeconds,
      source: ev.source || 'counter'
    }));

    const { error } = await supabase.from('study_events').upsert(rows, { onConflict: 'id' });
    if (error) throw error;

    await markStudyEventsSynced(pending.map((ev) => ev.id));
  })();

  try {
    await flushInFlight;
  } finally {
    flushInFlight = null;
  }
}

export async function updateStudyEvent(event) {
  if (!event?.id) throw new Error('Event id is required.');

  const user = await getSessionUser();
  const supabase = await getSupabaseClient();
  if (!user || !supabase) throw new Error('Authentication required.');

  const row = {
    id: event.id,
    user_id: user.id,
    occurred_at: event.occurredAt,
    page_key: event.pageKey,
    content_key: event.contentKey ?? '',
    unit_count: event.unitCount,
    estimated_seconds: event.estimatedSeconds,
    source: event.source || 'manual'
  };

  const { error } = await supabase.from('study_events').upsert(row, { onConflict: 'id' });
  if (error) throw error;

  await recordStudyEvent({
    ...event,
    syncStatus: 'synced',
    syncedAt: new Date().toISOString()
  });
}

export async function removeStudyEvent(id) {
  if (!id) throw new Error('Event id is required.');

  const user = await getSessionUser();
  const supabase = await getSupabaseClient();
  if (!user || !supabase) throw new Error('Authentication required.');

  const { error } = await supabase
    .from('study_events')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) throw error;

  await deleteStudyEvent(id);
}
