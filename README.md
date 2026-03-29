# Assignment Memorizer

アメリカンフットボールのオフェンス学習用に、初期配置から各ポジションの動きを線で覚えるための Next.js アプリです。

## 主な機能

- プレー一覧表示
- プレー詳細で正解動線を確認
- フィールド上に自分で線を描いて判定
- 苦手なプレー、ポジションの優先復習
- localStorage 保存
- プレーデータの JSON 編集

## 技術スタック

- Next.js
- React
- TypeScript
- Tailwind CSS

## フォルダ構成

```text
football-assignment-trainer/
├─ app/
│  ├─ editor/
│  ├─ plays/
│  │  └─ [id]/
│  ├─ quiz/
│  ├─ review/
│  ├─ globals.css
│  ├─ layout.tsx
│  └─ page.tsx
├─ components/
├─ data/
├─ lib/
├─ types/
├─ README.md
├─ package.json
├─ next.config.ts
├─ postcss.config.mjs
├─ tsconfig.json
└─ 起動用.bat
```

## データ構造

`data/plays.ts` では、各プレーが次の情報を持ちます。

- `id`
- `name`
- `formation`
- `type`
- `tags`
- `coachingPoints`
- `commonMistakes`
- `movements`

`movements` の各ポジションは次を持ちます。

- `start`: 初期位置
- `path`: 正解の動線
- `kind`: block / route / carry / fake / handoff
- `summary`
- `coachingTip`

## 起動方法

Node.js 20 以上を入れたあと、次のどちらかで起動できます。

```bash
cd football-assignment-trainer
npm install
npm run dev
```

または [起動用.bat](C:/Users/81804/OneDrive/ドキュメント/New%20project/football-assignment-trainer/起動用.bat) をダブルクリックしてください。

ブラウザで `http://localhost:3000` を開きます。

## 主要ファイル

- `app/page.tsx`: ホーム
- `app/plays/page.tsx`: プレー一覧
- `app/plays/[id]/page.tsx`: プレー詳細
- `app/quiz/page.tsx`: 動線トレーナー
- `app/review/page.tsx`: 苦手復習
- `app/editor/page.tsx`: JSON 編集画面
- `data/plays.ts`: サンプルプレーデータ
- `lib/training.ts`: 動線判定と出題ロジック
- `lib/storage.ts`: localStorage 保存
- `types/play.ts`: 型定義

## 今後の拡張案

- ドラッグ描画対応
- 中継点ごとの厳密判定
- フォーメーション別テンプレート
- 守備側の動線追加
- DB 化とユーザー管理

## 改善ポイント

- 今はクリックで折れ線を作る最小実装です
- JSON 編集は初心者向け UI ではないので、将来は専用フォーム化したいです
- 採点は距離ベースの簡易判定なので、今後は角度やタイミングも評価できます
