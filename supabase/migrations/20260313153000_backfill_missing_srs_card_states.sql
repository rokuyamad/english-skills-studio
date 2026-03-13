-- Backfill missing bidirectional SRS states for existing ready cards.

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
  d.direction,
  c.user_id,
  now(),
  0,
  5,
  0,
  0,
  null,
  now()
from public.srs_cards c
cross join (
  values ('en_to_ja'), ('ja_to_en')
) as d(direction)
where c.status = 'ready'
  and c.is_active = true
  and not exists (
    select 1
    from public.srs_card_states s
    where s.card_id = c.id
      and s.direction = d.direction
  );
