# 学習伴走ノート (NoteApp)

専門学校・大学生向けの学習ノートアプリです。PCで書いて、スマホで復習することを想定しています。
ノートは「科目 › 単元 › ノート」の3段で整理します。

## 主な機能

- リッチテキストでのノート作成（見出し・色・表・チェックリスト）
- AIによる復習支援
  - **理解度テスト**：ノートから4択問題を作る
  - **説明チェック**：用語を自分の言葉で説明し、採点とアドバイスを受ける
  - **要約**：ノートを3〜5行にまとめる
  - **写真から取り込み**：手書きノートの写真から用語と説明を読み取る

## 2つのモード（本物 / デモ）

コードは1つのまま、環境変数 `AI_MODE` だけで AI の動きを切り替えます。

| モード | AI_MODE                              | AI の中身                                      | 費用     | 公開   |
| ------ | ------------------------------------ | ---------------------------------------------- | -------- | ------ |
| 開発版 | `real`                               | 自分のサーバー（`api/ai.js`）経由で Gemini API | 従量課金 | しない |
| 公開版 | `mock`（未設定・書き間違いもこちら） | `public/ai/samples/` に保存したサンプル出力    | 0円      | する   |

- 画面（`app.js`）は `ai/index.js` だけを呼び、どちらのモードかを知りません
- どちらのモードでも「考え中…」→ 文字が少しずつ出る → （デモなら）「デモ表示：サンプルの出力です」の順に表示します
- デモは何を入力してもサンプルを返します（入力に合わせたふりはしません）

## フォルダの構成

```
public/                 画面。ブラウザに配信されるのはこの中だけ
  index.html / dashboard.html / app.js / styles.css
  ai/
    index.js            切り替え口（画面はここだけを使う）
    types.js            入出力の形・エラーの種類
    realClient.js       本物（api/ai を呼ぶ）。公開版には入れない
    mockClient.js       デモ（通信しない。samples/ から返す）
    config.js           モードとタイピング速度（既定はデモ）
    samples/*.json      デモ用のサンプル出力（機能ごとに input と outputs）
  components/
    AiOutput.js         考え中・タイピング表示
    DemoBadge.js        「デモ表示」ラベル
api/ai.js               Gemini を呼ぶ中継。APIキーを使う唯一の場所（開発版だけ）
dev-server.mjs          手元用サーバー
scripts/build-demo.mjs  公開版を dist/ に書き出す
scripts/make-samples.mjs サンプル出力を本物の AI で作り直す
check-key.mjs           APIキーが使えるかの確認
.env.example            設定項目の見本（値は空）
.env.local              開発用の実際の値（Git に含めない）
```

## 開発版を動かす（本物の AI）

Node.js 22 以上が必要です。

1. `.env.example` をコピーして `.env.local` を作り、`AI_MODE=real`・`GEMINI_API_KEY`・`GEMINI_MODEL` を入れる
2. `npm run check` でキーとモデルが使えるか確かめる
3. `npm run dev` → http://localhost:5173

同じWi-Fiの人にも見せるときは `npm run dev:lan`（AI の回数はあなたのキーから使われます）。

### 1日の回数の上限

`api/ai.js` は1日に Gemini を呼ぶ回数を `DAILY_LIMIT`（省略時 50）までに抑えます。超えると画面に「利用上限に達しました」と出ます（Gemini 側の上限に達したときも同じ表示）。回数はサーバーを起動している間だけ数え、日付が変わると戻ります。

### サンプル出力を作り直す

```
node --env-file=.env.local scripts/make-samples.mjs
```

初期データのノート「ネットワークの基礎」で各機能を本物の AI で動かし、`public/ai/samples/` に保存します（Gemini を7回使います）。

## 公開版（デモ・0円）

```
npm run build:demo     # dist/ に書き出す
npm run preview:demo   # dist/ をhttp://localhost:5173  で確認
```

`build:demo` は次を自動で行い、1つでも守れていなければ失敗します。

- `ai/realClient.js` を入れず、`ai/index.js` から本物を読み込む部分を消す
- `ai/config.js` を必ずデモで書き出す（`AI_MODE=real` のままなら止める）
- できあがったファイルに `gemini`・`API_KEY`・接続先・APIキーの値が無いか調べる

### Vercel で公開する

1. GitHub に push する（`.env.local` と `dist/` は `.gitignore` で除外済み）
2. Vercel でリポジトリを選ぶ。ビルド設定は `vercel.json` に書いてある（`npm run build:demo` → `dist/`）
3. Environment Variables には `AI_MODE=mock` だけを設定する。**キーとモデル名は設定しない**
4. Deploy

`api/` は `.vercelignore` で公開先に送らないので、公開版から Gemini は呼べません。

## 自分でやること（コードの外）

- [ ] Google Cloud で予算アラートを設定する（例：月500円）
- [ ] Gemini API の割り当て（Quota）を開発に必要な分まで下げる
- [ ] GitHub に上げる前に、履歴にキーが含まれていないか確認する

## 注意

- 無料枠では、送った内容が Google のサービス改善に使われることがあります。個人情報はノートに書かないでください。
- `.env.local` は絶対にコミットしないでください。
