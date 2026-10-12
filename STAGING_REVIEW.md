# FANTASISTA レビュー環境

## 目的

レビュー環境は、管理者が本番公開前に実際のURLで変更内容を確認するためのCloudflare Pagesテスト環境です。

- GitHub: `https://github.com/tusfantasista/tus-fantasista`
- Cloudflare Pagesプロジェクト: `fantasista-review-202605-staging`
- レビューURL: `https://fantasista-review-202605-staging.pages.dev/`
- D1: `festa60_staging`
- Stripe: サンドボックス
- 専用設定: `wrangler.staging.jsonc`

ローカルプレビューとGitHubのPRは中間確認・事前検査・履歴確認に使います。この運用でいう「Cloudflareレビュー」は上記テスト環境での確認を指し、管理者の明示依頼があるレビュー単位だけを反映します。

## 反映する条件

次のいずれかを満たす場合だけCloudflare Previewを作成します。

- 管理者が「テスト環境へ反映」「レビュー環境を更新」などと明示した。
- Stripeサンドボックス、D1、Cloudflare Access、メールなど、ローカルでは確認できない統合テストが必要で、目的を説明して管理者の承認を得た。

Gitコミット、GitHubへのpush、ローカル検査の完了だけを理由にデプロイしません。複数の修正は一つのレビュー単位へまとめます。

## 反映前の確認

1. 作業ブランチへ変更をコミットし、GitHubへプッシュする。
2. `git status --short` で意図しない未コミット変更がないことを確認する。
3. `RELEASE_WORKFLOW.md` の標準検査をすべて通す。
4. 個人情報、秘密情報、内部資料が公開対象に含まれていないことを確認する。
5. `wrangler.staging.jsonc` が `festa60_staging` を参照していることを確認する。
6. `public/_routes.json` が既知のAPIと保護ページだけをFunctions対象とし、`/*` を含まないことを確認する。
7. `public/robots.txt` と `public/_headers` がレビュー環境を検索対象外にしていることを確認する。
8. レビュー環境に `STAFF_PAYMENT_ACCESS_CODE` が暗号化シークレットとして設定されていることを確認する。
9. 同じコミットの成功済みデプロイが既にないことを `wrangler pages deployment list` で確認する。

## レビュー環境への反映

本番用の `wrangler.toml` は使用しません。必ずレビュー専用設定を明示します。

原則として1レビュー単位につき1回だけ実行します。表示確認だけを目的に同じコミットを再デプロイせず、固定のブランチ別URLを再利用します。

```bash
npx wrangler pages deploy public \
  --project-name fantasista-review-202605-staging \
  --config wrangler.staging.jsonc
```

## 反映後の確認

- トップ、60周年特設、申込、FAQ、問い合わせの対象ページが表示できる。
- 画面にテスト環境の表示がある。
- `/api/festa60/config` がliveモードを返さない。
- 申込データは `festa60_staging` にのみ保存される。
- 一般申込はStripeサンドボックスへ遷移し、カード、対象端末のApple Pay・Google Pay、銀行振込の有効な方法が表示される。
- StripeサンドボックスのWebhook送信先は `/api/festa60/stripe/webhook` とし、`checkout.session.completed`、`checkout.session.async_payment_succeeded`、`checkout.session.async_payment_failed`、`checkout.session.expired`、`payment_intent.succeeded`、`payment_intent.partially_funded`、`charge.refunded`、`cash_balance.funds_available` の8イベントを購読する。
- 銀行振込の不足入金テストでは、D1の支払状態が `partially_funded`、申込状態が未確定のままとなり、確認済み入金額・不足額・メール送信時刻が記録されることを確認する。
- `migrations/20260808_harden_bank_transfer_flow.sql` をレビューD1へ適用し、申込確定前入金、入金後の支払方法変更拒否、二重確定防止、未消込残高の管理画面表示を確認する。
- `migrations/20260810_add_pricing_supporter_publication.sql` をレビューD1へ適用し、新料金版、寄付相当額、掲載同意項目、銀行振込プレビューの料金スナップショットを確認する。旧申込の確定金額を再計算しない。
- `/api/festa60/config` が承認済みの `pricing_version` を返し、カードと銀行振込のサーバー計算額が同一になることを確認する。
- `/api/festa60/public-summary` は未入金を含む未キャンセル・未返金の申込を集計し（支払状態・申込状態・取消日時・返金日時のいずれかが取消・返金を示す申込は除外）、メール、電話、住所、受付番号、内部IDを返さないことを確認する。OBOG参加人数・同伴者数・卒部年代は20名未満でも表示し、0名も正しく表示する。参加目標120名の進捗・残り人数はOBOG参加人数と同伴者数の合計で計算し、同伴者込みであることを画面に明示する。旧環境変数 `PUBLIC_PARTICIPANT_COUNT_THRESHOLD` が残っていても表示を妨げないことを確認する。
- `/festa60-admin/` と `/api/festa60/admin/*` はCloudflare Access認証後だけ表示でき、未認証では申込者の個人情報を返さない。
- 管理画面の集計、検索、入金状態・プラン絞り込み、詳細表示、Stripe決済リンク、CSV出力を確認する。
- `/festa60-register/?staff=1` だけに役員・当日お手伝い専用申込が表示され、一般申込には専用料金へのリンクがない。
- 専用申込は正しいアクセスコードでのみ受け付け、コードはD1やGitHubに保存されない。
- レビュー対象コミットとレビューURLを管理者へ提示する。

レビュー完了後も、管理者から明示的な本番許可が出るまで、`main`へのマージ、本番Pagesへのデプロイ、Stripe live設定、本番D1や本番メール設定の変更は行いません。
