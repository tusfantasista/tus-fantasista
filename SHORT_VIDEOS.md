# 60周年ショート動画

公開ソースは `public/`。配信対象は音終端を見直した承認済み24本（PR10本・歴史14本）です。

- トップ: `/festa-60th/#pr-video`。PR10本から1本を選び、手動で再生。
- PR一覧: `/festa-60th/shorts/?kind=pr`
- 歴史一覧: `/festa-60th/shorts/?kind=history`
- 個別共有: `/festa-60th/shorts/?video=pr01` または `?video=h01`
- 全体版: `/festa-60th/#pr-video-full`。既存の1分55秒版とHLSを保持。
- 集計: `/festa60-admin/` の動画別再生状況。

## 素材と識別子

`public/assets/data/festa60-shorts.json` がタイトル・種別・尺・MP4・ポスター・共有先の公開カタログです。MP4は `public/festa-60th/media/shorts/` に置き、各ファイルはCloudflare Pagesの25MiB上限内です。カタログのSHA256は承認済み動画との照合に使います。

短編IDは `festa60-short-pr01`〜`pr10`、`festa60-short-h01`〜`h14`。旧全体版の `festa60-pr` と既存記録は保持します。APIの有限ID一覧、DBのCHECK制約、公開カタログは同じIDを扱います。

再生開始は選択・再生セッション単位。通信の再送、一時停止・再開で重複計上しません。完了は実再生区間の和集合が9割以上となり、最後に到達した場合です。末尾へのシークだけでは完了になりません。再生セッションのランダムIDは動画ごとに更新し、CRMへは動画別の集計値と日本時間の日別集計を返します。

## DBと配信の順序

`migrations/20261113_add_short_video_metrics.sql` は、既存の再生行をコピーして保持したまま動画ID制約を拡張します。適用はWranglerの原子的なD1 migration機能を使います。適用前に既存schema・件数・migration履歴を確認し、バックアップを確保してください。他の未適用migrationを無確認で同時適用しないでください。

1. ステージングのschemaを更新し、既存件数保持・24ID受理・重複排除・管理API認証を確認。
2. 本番のschemaを同じmigrationで更新。適用前後の既存件数を照合。
3. 承認済みソースをFESTA60プロジェクトへ配信。
4. 公開画面、24素材、共有先、最新情報、CRM・既存全体版を確認。

旧Workerは拡張後schemaでも従来の全体版を扱えるため、Workerのロールバックで記録の削除やDBの縮小は不要です。新しい短編の記録を捨てる逆migrationは行いません。申込・決済・クーポンのデータは今回のmigration対象外です。

## 主な確認

```bash
node scripts/test-festa60-video-metrics.mjs
node scripts/test-festa60-short-video-metrics.mjs
node scripts/check-short-video-metrics.mjs
./scripts/build-festa60-production.sh
./scripts/build-fantasista-production.sh
node scripts/check-local-links.mjs public
node scripts/check-local-links.mjs festa60-public
node scripts/check-local-links.mjs fantasista-site/public
node scripts/check-cloudflare-routing.mjs
```

PagesとD1の既存権限があるCloudflare認証を使います。認証情報・内部校閲・元の聞き取り資料・DBバックアップを公開ソースへ追加しません。
