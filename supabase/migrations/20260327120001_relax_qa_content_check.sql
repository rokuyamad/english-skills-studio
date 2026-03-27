-- QA カードは hint (term_ja) と context (example_ja) が任意のため
-- ready_content_check を card_type='qa' に対して緩める

ALTER TABLE srs_cards DROP CONSTRAINT IF EXISTS srs_cards_ready_content_check;

ALTER TABLE srs_cards ADD CONSTRAINT srs_cards_ready_content_check
  CHECK (
    status = 'draft'
    OR (
      card_type = 'qa'
      AND btrim(term_en) <> ''
      AND btrim(example_en) <> ''
    )
    OR (
      card_type IN ('word', 'idiom', 'phrase')
      AND btrim(term_en) <> ''
      AND btrim(term_ja) <> ''
      AND btrim(example_en) <> ''
      AND btrim(example_ja) <> ''
    )
  );
