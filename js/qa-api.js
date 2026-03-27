import { getSessionUser, getSupabaseClient } from './auth.js';
import { computeNextState } from './srs-scheduler.js';

const QA_DIRECTION = 'en_to_ja';

function normalizeQuestion(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim();
}

function toDisplayQaCard(row) {
  const card = row.srs_cards || {};
  return {
    cardId: row.card_id,
    direction: QA_DIRECTION,
    dueAt: row.due_at,
    reps: Number(row.reps || 0),
    lapses: Number(row.lapses || 0),
    stabilityDays: Number(row.stability_days || 0),
    difficulty: Number(row.difficulty || 5),
    lastReviewedAt: row.last_reviewed_at,
    question: card.term_en || '',
    hint: card.term_ja || '',
    answerEn: card.example_en || '',
    answerJa: card.example_ja || ''
  };
}

function shuffleInPlace(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

async function ensureQaState({ supabase, userId, cardId, nowIso = new Date().toISOString() }) {
  const { data: existing, error: existingError } = await supabase
    .from('srs_card_states')
    .select('card_id')
    .eq('user_id', userId)
    .eq('card_id', cardId)
    .eq('direction', QA_DIRECTION)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.card_id) return;

  const { error: insertError } = await supabase
    .from('srs_card_states')
    .insert({
      card_id: cardId,
      direction: QA_DIRECTION,
      user_id: userId,
      due_at: nowIso,
      reps: 0,
      lapses: 0,
      stability_days: 0,
      difficulty: 5,
      last_reviewed_at: null,
      updated_at: nowIso
    });

  if (insertError && insertError.code !== '23505') throw insertError;
}

export async function fetchDueQaCount() {
  const user = await getSessionUser();
  const supabase = await getSupabaseClient();
  if (!user || !supabase) return 0;

  const { data: cards, error: cardsError } = await supabase
    .from('srs_cards')
    .select('id')
    .eq('user_id', user.id)
    .eq('card_type', 'qa')
    .eq('is_active', true);

  if (cardsError) throw cardsError;
  await Promise.all(
    (Array.isArray(cards) ? cards : []).map((card) => ensureQaState({ supabase, userId: user.id, cardId: card.id }))
  );

  const nowIso = new Date().toISOString();
  const { count, error } = await supabase
    .from('srs_card_states')
    .select('card_id, srs_cards!inner(id, user_id, card_type, is_active)', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('srs_cards.user_id', user.id)
    .eq('srs_cards.card_type', 'qa')
    .eq('srs_cards.is_active', true)
    .eq('direction', QA_DIRECTION)
    .lte('due_at', nowIso);

  if (error) throw error;
  return Number(count || 0);
}

export async function fetchDueQaCards({ limit = 30 } = {}) {
  const user = await getSessionUser();
  const supabase = await getSupabaseClient();
  if (!user || !supabase) return [];

  const { data: cards, error: cardsError } = await supabase
    .from('srs_cards')
    .select('id')
    .eq('user_id', user.id)
    .eq('card_type', 'qa')
    .eq('is_active', true);

  if (cardsError) throw cardsError;
  await Promise.all(
    (Array.isArray(cards) ? cards : []).map((card) => ensureQaState({ supabase, userId: user.id, cardId: card.id }))
  );

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('srs_card_states')
    .select('card_id, direction, due_at, reps, lapses, stability_days, difficulty, last_reviewed_at, srs_cards!inner(id, user_id, card_type, term_en, term_ja, example_en, example_ja, is_active)')
    .eq('user_id', user.id)
    .eq('srs_cards.user_id', user.id)
    .eq('srs_cards.card_type', 'qa')
    .eq('srs_cards.is_active', true)
    .eq('direction', QA_DIRECTION)
    .lte('due_at', nowIso)
    .order('due_at', { ascending: true })
    .limit(Math.max(1, Math.min(200, Number(limit || 30))));

  if (error) throw error;
  const displayCards = Array.isArray(data) ? data.map(toDisplayQaCard) : [];
  shuffleInPlace(displayCards);
  return displayCards;
}

export async function submitQaReview({ cardId, grade }) {
  const safeGrade = String(grade || '').toLowerCase();
  if (!['again', 'good', 'easy'].includes(safeGrade)) {
    throw new Error('Invalid grade');
  }

  const user = await getSessionUser();
  const supabase = await getSupabaseClient();
  if (!user || !supabase) throw new Error('Authentication required.');

  const now = new Date();
  const nowIso = now.toISOString();

  const { data: existing, error: fetchError } = await supabase
    .from('srs_card_states')
    .select('card_id, direction, due_at, reps, lapses, stability_days, difficulty, last_reviewed_at')
    .eq('user_id', user.id)
    .eq('card_id', cardId)
    .eq('direction', QA_DIRECTION)
    .maybeSingle();

  if (fetchError) throw fetchError;

  const current = existing
    ? {
        reps: Number(existing.reps || 0),
        lapses: Number(existing.lapses || 0),
        stability_days: Number(existing.stability_days || 0),
        difficulty: Number(existing.difficulty || 5),
        due_at: existing.due_at,
        last_reviewed_at: existing.last_reviewed_at
      }
    : { reps: 0, lapses: 0, stability_days: 0, difficulty: 5, due_at: nowIso, last_reviewed_at: null };

  const next = computeNextState(current, safeGrade, now);

  const { error: upsertError } = await supabase
    .from('srs_card_states')
    .upsert(
      {
        card_id: cardId,
        direction: QA_DIRECTION,
        user_id: user.id,
        due_at: next.due_at,
        reps: next.reps,
        lapses: next.lapses,
        stability_days: next.stability_days,
        difficulty: next.difficulty,
        last_reviewed_at: next.last_reviewed_at,
        updated_at: next.updated_at
      },
      { onConflict: 'card_id,direction' }
    );

  if (upsertError) throw upsertError;

  const { error: logError } = await supabase
    .from('srs_review_logs')
    .insert({
      id: crypto.randomUUID(),
      card_id: cardId,
      user_id: user.id,
      direction: QA_DIRECTION,
      grade: safeGrade,
      reviewed_at: nowIso,
      prev_due_at: current.due_at,
      next_due_at: next.due_at,
      prev_stability_days: current.stability_days,
      next_stability_days: next.stability_days,
      prev_difficulty: current.difficulty,
      next_difficulty: next.difficulty
    });

  if (logError) throw logError;
  return { current, next };
}

export async function saveQaCard({ question, hint = '', answerEn = '', answerJa = '' }) {
  const normalizedQuestion = normalizeQuestion(question);
  if (!normalizedQuestion) throw new Error('Question is required.');
  if (!String(answerEn || '').trim()) throw new Error('Model answer is required.');

  const user = await getSessionUser();
  const supabase = await getSupabaseClient();
  if (!user || !supabase) throw new Error('Authentication required.');

  const nowIso = new Date().toISOString();
  const normalizedTerm = normalizedQuestion.toLowerCase();

  const { data: existing, error: existingError } = await supabase
    .from('srs_cards')
    .select('id, term_en, status, is_active')
    .eq('user_id', user.id)
    .eq('normalized_term', normalizedTerm)
    .eq('card_type', 'qa')
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing?.id) {
    return { result: 'duplicate', cardId: existing.id, question: existing.term_en };
  }

  const row = {
    id: crypto.randomUUID(),
    user_id: user.id,
    card_type: 'qa',
    term_en: normalizedQuestion,
    term_ja: String(hint || '').trim(),
    example_en: String(answerEn || '').replace(/\s+/g, ' ').trim(),
    example_ja: String(answerJa || '').replace(/\s+/g, ' ').trim(),
    normalized_term: normalizedTerm,
    status: 'ready',
    is_active: true
  };

  const { data: inserted, error: insertError } = await supabase
    .from('srs_cards')
    .insert(row)
    .select('id, term_en, status, is_active')
    .single();

  if (insertError) throw insertError;

  const { error: stateError } = await supabase
    .from('srs_card_states')
    .insert({
      card_id: inserted.id,
      direction: QA_DIRECTION,
      user_id: user.id,
      due_at: nowIso,
      reps: 0,
      lapses: 0,
      stability_days: 0,
      difficulty: 5,
      last_reviewed_at: null,
      updated_at: nowIso
    });

  if (stateError) throw stateError;

  return {
    result: 'created',
    cardId: inserted.id,
    question: inserted.term_en
  };
}
