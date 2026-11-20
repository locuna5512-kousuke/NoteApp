# 学習伴走ノート (NoteApp)

専門学校生・大学生向けの学習ノートアプリです。PC でノートを書き、スマホで復習する使い方を想定しています。
ノートは「科目 › 単元 › ノート」の3段で整理します。

> **公開中の版はデモです。** AI の機能は、あらかじめ用意したサンプル出力を表示します。何を入力しても同じサンプルが返り、入力した内容がどこかへ送られることはありません。

## 主な機能

- **ノート作成**：見出し・文字色・表・チェックリストが使えるリッチテキスト
- **AI による復習支援**
  - **理解度テスト**：ノートから4択問題を作ります
  - **説明チェック**：用語を自分の言葉で説明すると、採点とアドバイスが返ります
  - **要約**：ノートを3〜5行にまとめます
  - **写真から取り込み**：手書きノートの写真から、用語と説明を読み取ります

## 本物版とデモ版

コードは1つで、環境変数 `AI_MODE` によって AI の動きを切り替えます。

| 版     | `AI_MODE`             | AI の中身                                          |
| ------ | --------------------- | -------------------------------------------------- |
| 本物版 | `real`                | サーバー（`api/ai.js`）を経由して Gemini API を呼ぶ |
| デモ版 | `mock`（未設定も同じ） | `public/ai/samples/` に保存したサンプル出力を表示   |

- 画面（`app.js`）は `ai/index.js` だけを呼び出すので、どちらの版で動いているかを知りません
- どちらの版でも「考え中…」→ 文字が少しずつ出る、の順に表示します。デモ版ではそのあとに「デモ表示：サンプルの出力です」と出ます

## 試してみる（デモ版）

Node.js 22 以上が必要です。APIキーは要りません。

```bash
npm run build:demo     # dist/ に書き出す
npm run preview:demo   # http://localhost:5173 で開く
```

## 本物の AI で動かす

Gemini の APIキーが必要です。[Google AI Studio](https://aistudio.google.com/) で作れます。

1. `.env.example` をコピーして `.env.local` を作り、`AI_MODE=real`・`GEMINI_API_KEY`・`GEMINI_MODEL` を書き込みます
2. `npm run check` で、キーとモデルが使えるかを確かめます
3. `npm run dev` を実行して http://localhost:5173 を開きます

同じ Wi-Fi にいる人にも見せるときは `npm run dev:lan` を使います（AI の利用回数はあなたのキーから引かれます）。

### 設定できる項目

| 変数             | 内容                                            |
| ---------------- | ----------------------------------------------- |
| `AI_MODE`        | `real` で本物、`mock` か未設定でデモ            |
| `GEMINI_API_KEY` | Gemini の APIキー（サーバー側だけが読みます）   |
| `GEMINI_MODEL`   | 使うモデル名                                    |
| `DAILY_LIMIT`    | 1日に Gemini を呼ぶ回数の上限（省略時 50）      |
| `TYPING_SPEED`   | タイピング表示で1文字にかける時間（ミリ秒、省略時 30） |

`DAILY_LIMIT` を超えると、画面に「利用上限に達しました」と出ます。回数はサーバーを起動している間だけ数え、日付が変わると0に戻ります。

### サンプル出力を作り直す

```bash
node --env-file=.env.local scripts/make-samples.mjs
```

初期データのノート「ネットワークの基礎」で各機能を本物の AI で動かし、結果を `public/ai/samples/` に保存します（Gemini を7回呼びます）。

## デモ版を公開する

`npm run build:demo` は、次のことを自動で行います。どれか1つでも守れていなければ、ビルドは失敗します。

- 本物の AI を呼ぶ `ai/realClient.js` を入れず、それを読み込む部分も消す
- `ai/config.js` を必ずデモ設定で書き出す（`AI_MODE=real` のままなら止める）
- できあがったファイルに、APIキーの値や接続先が入っていないかを調べる

### Vercel で公開する

1. リポジトリを Vercel に読み込みます。ビルド設定は `vercel.json` に書いてあります（`npm run build:demo` で `dist/` を出力）
2. Environment Variables には `AI_MODE=mock` だけを設定します。**APIキーとモデル名は設定しないでください**
3. Deploy します

`api/` は `.vercelignore` で公開先に送らないので、公開版から Gemini を呼ぶことはできません。

## フォルダの構成

```
public/                  画面。ブラウザに配信されるのはこの中だけ
  index.html / dashboard.html / app.js / styles.css
  ai/
    index.js             切り替え口（画面はここだけを使う）
    types.js             入出力の形とエラーの種類
    realClient.js        本物版（api/ai を呼ぶ）。デモ版には入らない
    mockClient.js        デモ版（通信しない。samples/ から返す）
    config.js            版の指定とタイピング速度（既定はデモ）
    samples/*.json       デモ用のサンプル出力
  components/
    AiOutput.js          「考え中」とタイピング表示
    DemoBadge.js         「デモ表示」ラベル
api/ai.js                Gemini を呼ぶ中継。APIキーを使うのはここだけ
dev-server.mjs           手元で動かすためのサーバー
scripts/build-demo.mjs   デモ版を dist/ に書き出す
scripts/make-samples.mjs サンプル出力を本物の AI で作り直す
check-key.mjs            APIキーが使えるかの確認
.env.example             設定項目の見本（値は空）
```

## 注意

- Gemini API の無料枠では、送った内容が Google のサービス改善に使われることがあります。本物版を使うときは、ノートに個人情報を書かないでください。
- `.env.local` には APIキーが入るので、Git にコミットしないでください（`.gitignore` で除外済みです）。
- 本物版を動かすときは、Google Cloud で予算アラートや API の割り当て（Quota）を設定しておくと安心です。
