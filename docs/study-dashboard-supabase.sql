-- Study Dashboard schema

create table if not exists public.study_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  occurred_at timestamptz not null,
  page_key text not null check (page_key in ('imitation', 'slash', 'shadowing', 'srs', 'external')),
  content_key text not null,
  unit_count int not null default 1 check (unit_count > 0),
  estimated_seconds int not null check (estimated_seconds > 0),
  source text not null default 'counter',
  created_at timestamptz not null default now()
);

create index if not exists study_events_user_occurred_idx
  on public.study_events (user_id, occurred_at desc);

create index if not exists study_events_user_page_idx
  on public.study_events (user_id, page_key, occurred_at desc);

alter table public.study_events enable row level security;

drop policy if exists "study_events_select_own" on public.study_events;
create policy "study_events_select_own"
on public.study_events for select
using (auth.uid() = user_id);

drop policy if exists "study_events_insert_own" on public.study_events;
create policy "study_events_insert_own"
on public.study_events for insert
with check (auth.uid() = user_id);

drop policy if exists "study_events_update_own" on public.study_events;
create policy "study_events_update_own"
on public.study_events for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "study_events_delete_own" on public.study_events;
create policy "study_events_delete_own"
on public.study_events for delete
using (auth.uid() = user_id);

create table if not exists public.study_user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.study_user_settings enable row level security;

drop policy if exists "study_user_settings_select_own" on public.study_user_settings;
create policy "study_user_settings_select_own"
on public.study_user_settings for select
using (auth.uid() = user_id);

drop policy if exists "study_user_settings_insert_own" on public.study_user_settings;
create policy "study_user_settings_insert_own"
on public.study_user_settings for insert
with check (auth.uid() = user_id);

drop policy if exists "study_user_settings_update_own" on public.study_user_settings;
create policy "study_user_settings_update_own"
on public.study_user_settings for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace view public.v_study_daily as
select
  user_id,
  (occurred_at at time zone 'Asia/Tokyo')::date as study_date,
  page_key,
  sum(unit_count) as total_units,
  sum(estimated_seconds) as total_seconds
from public.study_events
group by user_id, study_date, page_key;
