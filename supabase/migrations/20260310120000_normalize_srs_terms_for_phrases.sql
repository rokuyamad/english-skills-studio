-- Normalize SRS term keys for multi-word expressions.
-- Align normalized_term with frontend/batch rules:
-- - normalize apostrophes
-- - trim edges
-- - collapse internal whitespace
-- - lowercase

update public.srs_cards
set normalized_term = lower(
  regexp_replace(
    btrim(replace(replace(coalesce(term_en, ''), '’', ''''), '`', '''')),
    '\s+',
    ' ',
    'g'
  )
)
where normalized_term is distinct from lower(
  regexp_replace(
    btrim(replace(replace(coalesce(term_en, ''), '’', ''''), '`', '''')),
    '\s+',
    ' ',
    'g'
  )
);
