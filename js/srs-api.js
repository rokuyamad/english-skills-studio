import { getSessionUser, getSupabaseClient } from './auth.js';
import { computeNextState } from './srs-scheduler.js';

const DIRECTIONS = ['en_to_ja', 'ja_to_en'];
const WORD_RE = /^[a-z]+(?:'[a-z]+)*$/i;

function normalizeCardType(raw) {
  const value = String(raw || '').toLowerCase();
  if (['word', 'idiom', 'phrase'].includes(value)) return value;
  return 'word';
}

export function normalizeEnglishWord(raw) {
  const value = String(raw || '')
    .replace(/[’`]/g, "'")
    .trim();

  if (!value || /\s/.test(value)) return '';
  const stripped = value.replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, '');
  if (!stripped || !WORD_RE.test(stripped)) return '';
  return stripped.toLowerCase();
}

function applyCardTypeFilter(query, cardType) {
  const safe = String(cardType || 'all').toLowerCase();
  if (['word', 'idiom', 'phrase'].includes(safe)) {
    return query.eq('srs_cards.card_type', safe);
  }
  return query;
}

function directionLabel(direction) {
  return direction === 'ja_to_en' ? 'JA→EN' : 'EN→JA';
}

function toDisplayCard(row) {
  const card = row.srs_cards || {};
  const direction = String(row.direction || 'en_to_ja').toLowerCase();

  const termEn = card.term_en || '';
  const termJa = card.term_ja || '';
  const exampleEn = card.example_en || '';
  const exampleJa = card.example_ja || '';

  const enToJa = direction !== 'ja_to_en';

  return {
    cardId: row.card_id,
    direction,
    directionLabel: directionLabel(direction),
    cardType: normalizeCardType(card.card_type),
    dueAt: row.due_at,
    reps: Number(row.reps || 0),
    lapses: Number(row.lapses || 0),
    stabilityDays: Number(row.stability_days || 0),
    difficulty: Number(row.difficulty || 5),
    lastReviewedAt: row.last_reviewed_at,
    promptText: enToJa ? termEn : termJa,
    hintText: enToJa ? exampleEn : exampleJa,
    answerPrimary: enToJa ? termJa : termEn,
    answerSecondary: enToJa ? exampleJa : exampleEn
  };
}

function shuffleInPlace(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function buildDueBaseQuery(supabase, userId, nowIso) {
  return supabase
    .from('srs_card_states')
    .select('card_id, direction, due_at, reps, lapses, stability_days, difficulty, last_reviewed_at, srs_cards!inner(id, user_id, card_type, term_en, term_ja, example_en, example_ja, is_active)')
    .eq('user_id', userId)
    .eq('srs_cards.user_id', userId)
    .eq('srs_cards.is_active', true)
    .in('direction', DIRECTIONS)
    .lte('due_at', nowIso);
}

export async function fetchDueCount({ cardType = 'all' } = {}) {
  const user = await getSessionUser();
  const supabase = await getSupabaseClient();
  if (!user || !supabase) return 0;

  const nowIso = new Date().toISOString();
  let query = supabase
    .from('srs_card_states')
    .select('card_id, direction, srs_cards!inner(id, user_id, card_type, is_active)', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('srs_cards.user_id', user.id)
    .eq('srs_cards.is_active', true)
    .in('direction', DIRECTIONS)
    .lte('due_at', nowIso);

  query = applyCardTypeFilter(query, cardType);

  const { count, error } = await query;
  if (error) throw error;
  return Number(count || 0);
}

export async function fetchDueCards({ cardType = 'all', limit = 30 } = {}) {
  const user = await getSessionUser();
  const supabase = await getSupabaseClient();
  if (!user || !supabase) return [];

  const nowIso = new Date().toISOString();
  let query = buildDueBaseQuery(supabase, user.id, nowIso);
  query = applyCardTypeFilter(query, cardType)
    .order('due_at', { ascending: true })
    .limit(Math.max(1, Math.min(200, Number(limit || 30))));

  const { data, error } = await query;
  if (error) throw error;

  const cards = Array.isArray(data) ? data.map(toDisplayCard) : [];
  shuffleInPlace(cards);
  return cards;
}

async function fetchCardStateOrBootstrap({ supabase, userId, cardId, direction, nowIso }) {
  const { data, error } = await supabase
    .from('srs_card_states')
    .select('card_id, direction, due_at, reps, lapses, stability_days, difficulty, last_reviewed_at')
    .eq('user_id', userId)
    .eq('card_id', cardId)
    .eq('direction', direction)
    .maybeSingle();

  if (error) throw error;
  if (data) {
    return {
      card_id: data.card_id,
      direction: data.direction,
      due_at: data.due_at,
      reps: Number(data.reps || 0),
      lapses: Number(data.lapses || 0),
      stability_days: Number(data.stability_days || 0),
      difficulty: Number(data.difficulty || 5),
      last_reviewed_at: data.last_reviewed_at
    };
  }

  const { data: cardRow, error: cardError } = await supabase
    .from('srs_cards')
    .select('id, user_id, is_active')
    .eq('id', cardId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (cardError) throw cardError;
  if (!cardRow?.id) throw new Error('SRS card not found or inactive.');

  return {
    card_id: cardId,
    direction,
    due_at: nowIso,
    reps: 0,
    lapses: 0,
    stability_days: 0,
    difficulty: 5,
    last_reviewed_at: null
  };
}

export async function submitReview({ cardId, direction, grade }) {
  const safeGrade = String(grade || '').toLowerCase();
  if (!['again', 'good', 'easy'].includes(safeGrade)) {
    throw new Error('Invalid grade');
  }

  const safeDirection = String(direction || '').toLowerCase();
  if (!DIRECTIONS.includes(safeDirection)) {
    throw new Error('Invalid direction');
  }

  const user = await getSessionUser();
  const supabase = await getSupabaseClient();
  if (!user || !supabase) throw new Error('Authentication required.');

  const now = new Date();
  const nowIso = now.toISOString();
  const current = await fetchCardStateOrBootstrap({
    supabase,
    userId: user.id,
    cardId,
    direction: safeDirection,
    nowIso
  });

  const next = computeNextState(current, safeGrade, now);

  const nextStateRow = {
    card_id: cardId,
    direction: safeDirection,
    user_id: user.id,
    due_at: next.due_at,
    reps: next.reps,
    lapses: next.lapses,
    stability_days: next.stability_days,
    difficulty: next.difficulty,
    last_reviewed_at: next.last_reviewed_at,
    updated_at: next.updated_at
  };

  const { error: stateError } = await supabase
    .from('srs_card_states')
    .upsert(nextStateRow, { onConflict: 'card_id,direction' });
  if (stateError) throw stateError;

  const logRow = {
    id: crypto.randomUUID(),
    card_id: cardId,
    user_id: user.id,
    direction: safeDirection,
    grade: safeGrade,
    reviewed_at: nowIso,
    prev_due_at: current.due_at,
    next_due_at: next.due_at,
    prev_stability_days: current.stability_days,
    next_stability_days: next.stability_days,
    prev_difficulty: current.difficulty,
    next_difficulty: next.difficulty
  };

  const { error: logError } = await supabase.from('srs_review_logs').insert(logRow);
  if (logError) throw logError;

  return { current, next };
}

export async function createDraftCard({ termEn } = {}) {
  const normalized = normalizeEnglishWord(termEn);
  if (!normalized) {
    throw new Error('Invalid word. Select or input a single English word.');
  }

  const user = await getSessionUser();
  const supabase = await getSupabaseClient();
  if (!user || !supabase) throw new Error('Authentication required.');

  const { data: existing, error: existingError } = await supabase
    .from('srs_cards')
    .select('id, term_en, status, is_active')
    .eq('user_id', user.id)
    .eq('normalized_term', normalized)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.id) {
    return {
      result: 'duplicate',
      cardId: existing.id,
      termEn: existing.term_en || normalized,
      status: existing.status || 'draft',
      isActive: Boolean(existing.is_active)
    };
  }

  const row = {
    id: crypto.randomUUID(),
    user_id: user.id,
    card_type: 'word',
    term_en: normalized,
    term_ja: '',
    example_en: '',
    example_ja: '',
    normalized_term: normalized,
    status: 'draft',
    is_active: false
  };

  const { data: inserted, error: insertError } = await supabase
    .from('srs_cards')
    .insert(row)
    .select('id, term_en, status, is_active')
    .single();

  if (insertError) {
    const msg = String(insertError.message || '');
    if (insertError.code === '23505' || msg.toLowerCase().includes('duplicate')) {
      const { data: dup, error: dupError } = await supabase
        .from('srs_cards')
        .select('id, term_en, status, is_active')
        .eq('user_id', user.id)
        .eq('normalized_term', normalized)
        .maybeSingle();
      if (dupError) throw dupError;
      if (dup?.id) {
        return {
          result: 'duplicate',
          cardId: dup.id,
          termEn: dup.term_en || normalized,
          status: dup.status || 'draft',
          isActive: Boolean(dup.is_active)
        };
      }
    }
    throw insertError;
  }

  return {
    result: 'created',
    cardId: inserted.id,
    termEn: inserted.term_en || normalized,
    status: inserted.status || 'draft',
    isActive: Boolean(inserted.is_active)
  };
}
