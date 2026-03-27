-- Backfill missing SRS state rows for QA cards.
-- QA Drill uses the standard en_to_ja direction only.

insert into public.srs_card_states (
  card_id,
  direction,
  user_id,
  due_at,
  stability_days,
  difficulty,
  reps,
  lapses,
  last_reviewed_at,
  updated_at
)
select
  c.id,
  'en_to_ja',
  c.user_id,
  coalesce(c.created_at, now()),
  0,
  5,
  0,
  0,
  null,
  now()
from public.srs_cards c
where c.card_type = 'qa'
  and c.is_active = true
  and not exists (
    select 1
    from public.srs_card_states s
    where s.card_id = c.id
      and s.direction = 'en_to_ja'
  );
