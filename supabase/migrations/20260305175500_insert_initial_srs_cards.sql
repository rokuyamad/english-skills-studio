-- Initial SRS cards for user 1a319559-7142-4712-8211-7d8b0097a0c7

with src (user_id, category, front, back, hint) as (
  values
    (
      '1a319559-7142-4712-8211-7d8b0097a0c7'::uuid,
      'phrase',
      'be engaged in',
      '〜に従事している、〜に取り組んでいる',
      'Researcher Kelly Morgan said that a significant number of young children began using smartphones during the Coronavirus pandemic when they were engaged in remote learning. / 研究者ケリー・モーガンは、コロナ禍で多くの幼い子どもが遠隔学習に取り組んでいた時期にスマートフォンを使い始めたと述べた。'
    ),
    (
      '1a319559-7142-4712-8211-7d8b0097a0c7'::uuid,
      'word',
      'decluttering',
      '（不要なものを）整理する、片づける',
      'They recommend decluttering your browsing space to reduce this stress. / このストレスを減らすために、ブラウジング空間を整理することが推奨されている。'
    ),
    (
      '1a319559-7142-4712-8211-7d8b0097a0c7'::uuid,
      'word',
      'arise',
      '生じる、発生する',
      'This clutter often arises when individuals attempt to manage too many tasks simultaneously. / このような散らかりは、人々が同時に多くのタスクを管理しようとするとしばしば生じる。'
    ),
    (
      '1a319559-7142-4712-8211-7d8b0097a0c7'::uuid,
      'word',
      'clutter',
      '散らかり、雑然さ／散らかす',
      'This clutter often arises when individuals leave tabs open without a clear purpose. / このような散らかりは、明確な目的なくタブを開いたままにするとしばしば起こる。'
    ),
    (
      '1a319559-7142-4712-8211-7d8b0097a0c7'::uuid,
      'word',
      'simultaneously',
      '同時に',
      'This clutter often arises when individuals attempt to manage too many tasks simultaneously. / このような散らかりは、人々が同時に多くのタスクを管理しようとするとしばしば生じる。'
    )
)
insert into public.srs_cards (id, user_id, category, front, back, hint, is_active)
select gen_random_uuid(), src.user_id, src.category, src.front, src.back, src.hint, true
from src
where not exists (
  select 1
  from public.srs_cards c
  where c.user_id = src.user_id
    and lower(c.front) = lower(src.front)
);

insert into public.srs_card_states (card_id, user_id, due_at, stability_days, difficulty, reps, lapses, last_reviewed_at, updated_at)
select c.id, c.user_id, now(), 0, 5, 0, 0, null, now()
from public.srs_cards c
where c.user_id = '1a319559-7142-4712-8211-7d8b0097a0c7'::uuid
  and lower(c.front) in ('be engaged in', 'decluttering', 'arise', 'clutter', 'simultaneously')
  and not exists (
    select 1 from public.srs_card_states s where s.card_id = c.id
  );
