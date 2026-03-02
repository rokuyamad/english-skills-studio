import { getSessionUser, getSupabaseClient } from './auth.js';
import {
  listPendingStudyEvents,
  markStudyEventsSynced,
  recordStudyEvent
} from './progress-db.js';

let flushInFlight = null;

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
      content_key: ev.contentKey,
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
