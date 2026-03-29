# football-assignment-trainer

アメリカンフットボールの体系作成、プレー作成、学習、テストをまとめた Next.js アプリです。

## 技術構成

- Next.js
- React
- TypeScript
- Tailwind CSS
- Supabase

## ローカル起動

```bash
npm install
npm run dev
```

## 共有保存について

このアプリは次の 2 モードで動きます。

- `NEXT_PUBLIC_SHARED_STORAGE_ENABLED=false` または未設定
  - これまでどおり `localStorage` 保存
- `NEXT_PUBLIC_SHARED_STORAGE_ENABLED=true`
  - `/api/shared-state` 経由で Supabase に共有保存

## 環境変数

[.env.example](C:/Users/81804/OneDrive/ドキュメント/New%20project/football-assignment-trainer/.env.example) を参考に `.env.local` を作成してください。

必要な値:

- `NEXT_PUBLIC_SHARED_STORAGE_ENABLED=true`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Supabase 設定

1. Supabase プロジェクトを作成
2. SQL Editor で [supabase/schema.sql](C:/Users/81804/OneDrive/ドキュメント/New%20project/football-assignment-trainer/supabase/schema.sql) を実行
3. `.env.local` に環境変数を入れる

このアプリは `public.shared_app_state` テーブルの `global` 行に、体系・プレー・テストをまとめて保存します。

## Vercel 設定

Vercel の Project Settings で次の環境変数を追加してください。

- `NEXT_PUBLIC_SHARED_STORAGE_ENABLED`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

追加後に Redeploy すれば、公開サイト上でも同じデータを共有できます。

## 主な保存データ

- 使用する体系
- 相手の体形
- プレー
- テスト
- 最近消去した体系
- 最近消去したプレー

## 注意

- `study-session` や `test-session` の選択状態はローカル保持です
- 編集保護パスワードは現在コード内の共通値です
- 本格運用する場合は認証追加をおすすめします
