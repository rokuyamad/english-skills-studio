-- Remove legacy one-way columns from srs_cards
-- (front, back, hint, category) after bidirectional migration is complete.

drop index if exists public.srs_cards_user_category_idx;

alter table public.srs_cards
  drop column if exists front,
  drop column if exists back,
  drop column if exists hint,
  drop column if exists category;
