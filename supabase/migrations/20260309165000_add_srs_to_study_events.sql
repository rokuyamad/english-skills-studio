alter table public.study_events
  drop constraint if exists study_events_page_key_check;

alter table public.study_events
  add constraint study_events_page_key_check
  check (page_key in ('imitation', 'slash', 'shadowing', 'srs'));
