-- Add a dedicated Japanese prompt field for QA Drill.
-- This keeps term_ja available as an optional hint / pattern field.

alter table public.srs_cards
  add column if not exists qa_prompt_ja text;

update public.srs_cards
set qa_prompt_ja = ''
where qa_prompt_ja is null;

alter table public.srs_cards
  alter column qa_prompt_ja set default '',
  alter column qa_prompt_ja set not null;
