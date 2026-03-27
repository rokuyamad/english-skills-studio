-- QA Drill 用に card_type の許容値に 'qa' を追加
ALTER TABLE srs_cards DROP CONSTRAINT IF EXISTS srs_cards_card_type_check;
ALTER TABLE srs_cards ADD CONSTRAINT srs_cards_card_type_check
  CHECK (card_type IN ('word', 'idiom', 'phrase', 'qa'));
