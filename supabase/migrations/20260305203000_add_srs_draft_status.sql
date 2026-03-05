-- Add draft/ready workflow for SRS cards.
-- - draft: quick-added word only, inactive
-- - ready: full card content, active allowed

alter table public.srs_cards
  add column if not exists status text,
  add column if not exists normalized_term text;

update public.srs_cards
set status = case
  when is_active then 'ready'
  else 'draft'
end
where status is null
   or lower(status) not in ('draft', 'ready');

update public.srs_cards
set normalized_term = lower(trim(coalesce(term_en, '')))
where normalized_term is null
   or normalized_term = '';

alter table public.srs_cards
  alter column status set not null,
  alter column status set default 'draft',
  alter column normalized_term set not null,
  alter column is_active set default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'srs_cards_status_check'
      and conrelid = 'public.srs_cards'::regclass
  ) then
    alter table public.srs_cards
      add constraint srs_cards_status_check
      check (status in ('draft', 'ready'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'srs_cards_status_active_check'
      and conrelid = 'public.srs_cards'::regclass
  ) then
    alter table public.srs_cards
      add constraint srs_cards_status_active_check
      check (
        (status = 'draft' and is_active = false)
        or status = 'ready'
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'srs_cards_ready_content_check'
      and conrelid = 'public.srs_cards'::regclass
  ) then
    alter table public.srs_cards
      add constraint srs_cards_ready_content_check
      check (
        status = 'draft'
        or (
          btrim(term_en) <> ''
          and btrim(term_ja) <> ''
          and btrim(example_en) <> ''
          and btrim(example_ja) <> ''
        )
      );
  end if;
end $$;

create unique index if not exists srs_cards_user_normalized_term_uidx
  on public.srs_cards (user_id, normalized_term);
