-- SRS bidirectional refactor
-- - cards: front/back/hint -> term_en/term_ja/example_en/example_ja
-- - category -> card_type (word/idiom/phrase)
-- - states: per-direction schedule (en_to_ja / ja_to_en)

-- 1) cards: add new columns
alter table public.srs_cards
  add column if not exists card_type text,
  add column if not exists term_en text,
  add column if not exists term_ja text,
  add column if not exists example_en text,
  add column if not exists example_ja text;

-- 2) backfill card_type from old category
update public.srs_cards
set card_type = case
  when lower(coalesce(card_type, '')) in ('word', 'idiom', 'phrase') then lower(card_type)
  when lower(coalesce(category, '')) = 'phrase' then 'phrase'
  else 'word'
end
where card_type is null
   or lower(card_type) not in ('word', 'idiom', 'phrase');

-- 3) backfill term/example columns from legacy front/back/hint
update public.srs_cards
set
  term_en = coalesce(nullif(term_en, ''), coalesce(front, '')),
  term_ja = coalesce(nullif(term_ja, ''), coalesce(back, '')),
  example_en = coalesce(
    nullif(example_en, ''),
    case
      when hint is null then ''
      when strpos(hint, ' / ') > 0 then split_part(hint, ' / ', 1)
      else ''
    end
  ),
  example_ja = coalesce(
    nullif(example_ja, ''),
    case
      when hint is null then ''
      when strpos(hint, ' / ') > 0 then split_part(hint, ' / ', 2)
      else hint
    end
  );

-- 4) ensure non-null values
update public.srs_cards
set
  term_en = coalesce(term_en, ''),
  term_ja = coalesce(term_ja, ''),
  example_en = coalesce(example_en, ''),
  example_ja = coalesce(example_ja, '');

alter table public.srs_cards
  alter column card_type set not null,
  alter column term_en set not null,
  alter column term_ja set not null,
  alter column example_en set not null,
  alter column example_ja set not null;

-- 5) replace category constraint with card_type constraint
alter table public.srs_cards
  drop constraint if exists srs_cards_category_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'srs_cards_card_type_check'
      and conrelid = 'public.srs_cards'::regclass
  ) then
    alter table public.srs_cards
      add constraint srs_cards_card_type_check
      check (card_type in ('word', 'idiom', 'phrase'));
  end if;
end $$;

create index if not exists srs_cards_user_card_type_idx
  on public.srs_cards (user_id, card_type);

-- 6) states: add direction and split to two schedules
alter table public.srs_card_states
  add column if not exists direction text;

update public.srs_card_states
set direction = 'en_to_ja'
where direction is null;

-- Drop old PK(card_id) before duplicating rows for ja_to_en.
alter table public.srs_card_states
  drop constraint if exists srs_card_states_pkey;

insert into public.srs_card_states (
  card_id,
  user_id,
  due_at,
  stability_days,
  difficulty,
  reps,
  lapses,
  last_reviewed_at,
  updated_at,
  direction
)
select
  s.card_id,
  s.user_id,
  s.due_at,
  s.stability_days,
  s.difficulty,
  s.reps,
  s.lapses,
  s.last_reviewed_at,
  s.updated_at,
  'ja_to_en'
from public.srs_card_states s
where s.direction = 'en_to_ja'
  and not exists (
    select 1
    from public.srs_card_states x
    where x.card_id = s.card_id
      and x.direction = 'ja_to_en'
  );

alter table public.srs_card_states
  alter column direction set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'srs_card_states_direction_check'
      and conrelid = 'public.srs_card_states'::regclass
  ) then
    alter table public.srs_card_states
      add constraint srs_card_states_direction_check
      check (direction in ('en_to_ja', 'ja_to_en'));
  end if;
end $$;

alter table public.srs_card_states
  add constraint srs_card_states_pkey primary key (card_id, direction);

create index if not exists srs_card_states_user_due_direction_idx
  on public.srs_card_states (user_id, due_at asc, direction);

-- 7) logs: add direction metadata
alter table public.srs_review_logs
  add column if not exists direction text;

update public.srs_review_logs
set direction = 'en_to_ja'
where direction is null;

alter table public.srs_review_logs
  alter column direction set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'srs_review_logs_direction_check'
      and conrelid = 'public.srs_review_logs'::regclass
  ) then
    alter table public.srs_review_logs
      add constraint srs_review_logs_direction_check
      check (direction in ('en_to_ja', 'ja_to_en'));
  end if;
end $$;

create index if not exists srs_review_logs_user_reviewed_direction_idx
  on public.srs_review_logs (user_id, reviewed_at desc, direction);
