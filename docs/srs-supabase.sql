-- SRS Review schema v2
-- Bidirectional schedule: en_to_ja / ja_to_en

create table if not exists public.srs_cards (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  card_type text not null check (card_type in ('word', 'idiom', 'phrase')),
  term_en text not null,
  term_ja text not null,
  example_en text not null,
  example_ja text not null,
  normalized_term text not null,
  status text not null default 'draft' check (status in ('draft', 'ready')),
  is_active boolean not null default false,
  constraint srs_cards_status_active_check
    check ((status = 'draft' and is_active = false) or status = 'ready'),
  constraint srs_cards_ready_content_check
    check (
      status = 'draft'
      or (
        btrim(term_en) <> ''
        and btrim(term_ja) <> ''
        and btrim(example_en) <> ''
        and btrim(example_ja) <> ''
      )
    ),
  created_at timestamptz not null default now()
);

create index if not exists srs_cards_user_card_type_idx
  on public.srs_cards (user_id, card_type);

create unique index if not exists srs_cards_user_normalized_term_uidx
  on public.srs_cards (user_id, normalized_term);

create table if not exists public.srs_card_states (
  card_id uuid not null references public.srs_cards(id) on delete cascade,
  direction text not null check (direction in ('en_to_ja', 'ja_to_en')),
  user_id uuid not null references auth.users(id) on delete cascade,
  due_at timestamptz not null,
  stability_days numeric not null default 0,
  difficulty numeric not null default 5,
  reps int not null default 0,
  lapses int not null default 0,
  last_reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (card_id, direction)
);

create index if not exists srs_card_states_user_due_direction_idx
  on public.srs_card_states (user_id, due_at asc, direction);

create table if not exists public.srs_review_logs (
  id uuid primary key,
  card_id uuid not null references public.srs_cards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  direction text not null check (direction in ('en_to_ja', 'ja_to_en')),
  grade text not null check (grade in ('again', 'good', 'easy')),
  reviewed_at timestamptz not null,
  prev_due_at timestamptz not null,
  next_due_at timestamptz not null,
  prev_stability_days numeric,
  next_stability_days numeric,
  prev_difficulty numeric,
  next_difficulty numeric,
  created_at timestamptz not null default now()
);

create index if not exists srs_review_logs_user_reviewed_direction_idx
  on public.srs_review_logs (user_id, reviewed_at desc, direction);

alter table public.srs_cards enable row level security;
alter table public.srs_card_states enable row level security;
alter table public.srs_review_logs enable row level security;

drop policy if exists "srs_cards_select_own" on public.srs_cards;
create policy "srs_cards_select_own"
on public.srs_cards for select
using (auth.uid() = user_id);

drop policy if exists "srs_cards_insert_own" on public.srs_cards;
create policy "srs_cards_insert_own"
on public.srs_cards for insert
with check (auth.uid() = user_id);

drop policy if exists "srs_cards_update_own" on public.srs_cards;
create policy "srs_cards_update_own"
on public.srs_cards for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "srs_card_states_select_own" on public.srs_card_states;
create policy "srs_card_states_select_own"
on public.srs_card_states for select
using (auth.uid() = user_id);

drop policy if exists "srs_card_states_insert_own" on public.srs_card_states;
create policy "srs_card_states_insert_own"
on public.srs_card_states for insert
with check (auth.uid() = user_id);

drop policy if exists "srs_card_states_update_own" on public.srs_card_states;
create policy "srs_card_states_update_own"
on public.srs_card_states for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "srs_review_logs_select_own" on public.srs_review_logs;
create policy "srs_review_logs_select_own"
on public.srs_review_logs for select
using (auth.uid() = user_id);

drop policy if exists "srs_review_logs_insert_own" on public.srs_review_logs;
create policy "srs_review_logs_insert_own"
on public.srs_review_logs for insert
with check (auth.uid() = user_id);
