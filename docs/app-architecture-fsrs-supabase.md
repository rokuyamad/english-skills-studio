# アプリ化設計メモ（PWA + Supabase + FSRS）

## 1. 目的
既存の英語学習PWA（`index.html` / `slash.html`）に、FSRSベースのカード復習機能を追加し、**自分専用**かつ**無料枠運用**で端末間同期を実現する。

## 2. 前提と決定事項
- 配布形態: PWA中心
- 同期要件: 必須
- コスト方針: 無料枠厳守
- 学習アルゴリズム: FSRS系（初期は公開実装の既定パラメータ）
- レビュー評価: `Again / Good / Easy`（3段階）
- 日次上限: 100件
- 教材データ: Supabaseへ移管
- 認証基盤: Supabase Auth

補足:
- 学習者は自分のみ想定のため、個別最適化は初期スコープ外
- Google OAuthは初期設定コストが高いので優先しない

## 3. ローカル完結 vs クラウド判断
- 現状は静的PWAでクラウド依存なし
- ただし「同期必須」のため、ローカル完結のみでは要件未達
- 1ユーザー運用・現在容量（`audio 約14MB`、`data 約80KB`）ならSupabase無料枠内で運用可能性が高い
- よって採用方針は「PWA + Supabase同期」

## 4. 全体アーキテクチャ
- フロント: 既存PWA + 新規 `cards.html`
- DB/同期: Supabase Postgres（RLS）
- メディア: Supabase Storage
- 認証: Supabase Auth
- 通知（将来）: Service Worker + Edge Functions + Cron

データフロー:
1. PWAでログイン
2. `due <= now` のカードを取得
3. 回答時にFSRS計算（フロント）
4. `card_states` をupsert、`review_logs` をinsert
5. オフライン時はローカルキュー、復帰後同期

## 5. FSRS実装方針
- 実装場所: フロント（`js/fsrs.js`）
- 理由:
  - 計算が軽い
  - 自分専用用途で十分
  - サーバー実行コストを抑えやすい
- 役割分離:
  - `js/fsrs.js`: 純粋計算ロジック
  - `js/cards-app.js`: UIと出題制御
  - `js/sync.js`: Supabase保存と再送制御

## 6. データモデル（MVP）
主要テーブル:
- `profiles`: ユーザー補助情報
- `decks`: デッキ
- `cards`: カード本文、音声パス
- `card_states`: カードごとの進行状態（`due_at`, `stability`, `difficulty`, `reps`, `lapses`）
- `review_logs`: 回答ログ

`card_states` が「カード状態」本体。これは「次回出題を決める内部状態」で、回答ごとに更新される。

## 7. 同期・競合ポリシー
- オフライン対応あり（ローカルキュー）
- 復帰後に順次再送
- 競合解決はMVPでは `updated_at` ベースの最終更新優先（LWW）

## 8. 新規カード/デッキ追加運用
推奨順:
1. 管理用JSONから一括upsert（最有力）
2. Supabase SQL Editorで直接追加（少量時）
3. 管理UI作成（将来）

運用ルール:
- `card_id` は固定
- 削除は論理削除（`is_active=false`）優先
- 新規追加時も既存進捗には影響させない
- 日次新規投入上限を設けて負荷急増を防止

## 9. Push通知方針（将来拡張）
- 実装可能
- 必要要素:
  - フロント: SWでpush受信
  - バックエンド: Edge Functionsで送信
  - 定期実行: Cron
- 初期案:
  - 「dueがある日に1日1回通知」から開始

## 10. 既存アプリへの変更点
追加:
- `cards.html`
- `js/cards-app.js`
- `js/cards-state.js`
- `js/cards-ui.js`
- `js/fsrs.js`
- `js/sync.js`

更新:
- `manifest.json` に Cards ショートカット追加
- `sw.js` のキャッシュ対象追加
- 既存2ページヘッダに Cards 導線追加

## 11. テスト観点
- 回答ごとの `due_at` 更新妥当性
- `Again < Good < Easy` の間隔差
- 日次100件上限の厳守
- オフライン回答の再送成功
- 別端末で進捗同期一致
- 既存 `index.html` / `slash.html` の回帰影響なし

## 12. 残課題（次回決定ポイント）
- Supabase Authの具体方式最終確定（匿名+PIN か Magic Link）
- 教材投入の運用方式（JSONバッチ or SQL直投入）
- 音声配信方式（Storage public / signed URL）
- 通知の導入時期（MVP同時 or 後追い）
