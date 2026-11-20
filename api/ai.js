// Gemini API を呼び出すサーバー側の処理 (開発版 = AI_MODE=real のときだけ使う)。
// API キーを使うのはここだけ。ブラウザには渡さない。公開版 (デモ) にはこのフォルダを含めない。
// 環境変数 (.env.local):
//   AI_MODE        real のときだけ動く。それ以外は何もせずに断る
//   GEMINI_API_KEY 必須
//   GEMINI_MODEL   必須 (使うモデル名。コードには書かない)
//   DAILY_LIMIT    1日に Gemini を呼んでよい回数 (省略時 50)。超えたら rate_limited を返す

const MODEL = process.env.GEMINI_MODEL;
const DAILY_LIMIT = Number(process.env.DAILY_LIMIT) || 50;
const MAX_NOTE = 8000; // 無料枠を守るため、送る文字数に上限を設ける
const MAX_IMAGE = 3_000_000; // 写真 (base64) の上限。Vercel の受け付け上限 4.5MB より小さくしておく
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
// Gemini を待つ時間の上限 (やり直しも含めた合計)。無料枠は混むと1分以上かかることがあるので長めにする。
// 画面には「考え中」と経過秒数が出ている
const TIME_LIMIT = 120_000;
const TIME_LIMIT_DEEP = 240_000; // 写真の読み取りは時間より精度を優先する

// JSON で返事をするための短い関数
const json = (data, status = 200) => Response.json(data, { status });

// 「文字列の配列」を表す、回答の形 (スキーマ) の部品
const strArr = { type: 'ARRAY', items: { type: 'STRING' } };

// AI にやらせる仕事の一覧。仕事ごとに「指示文 (prompt)」と「回答の形 (schema)」を作る
const TASKS = {
  // 4択テスト
  quiz: ({ note, count }) => ({
    prompt: `次の学習ノートの内容だけを使って、理解度を確かめる4択問題を${count}問作ってください。
- 問題文は短く、日本語で
- choices は4つ。answer は choices のどれか1つと完全に同じ文字列
- ノートに書かれていないことは問題にしない

ノート:
${note}`,
    schema: {
      type: 'OBJECT',
      properties: {
        questions: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { text: { type: 'STRING' }, choices: strArr, answer: { type: 'STRING' } },
            required: ['text', 'choices', 'answer'],
          },
        },
      },
      required: ['questions'],
    },
  }),

  // 自分の言葉での説明をチェック
  check: ({ term, desc, answer }) => ({
    prompt: `学生が用語「${term}」をノートを見ずに説明しました。ノートの説明と比べて採点してください。
- score: 0〜100
- hit: 学生の説明に入っていた大事な言葉
- miss: 抜けていた大事な言葉
- comment: 励ましつつ、直すとよい点を1〜2文で

ノートの説明: ${desc}
学生の説明: ${answer}`,
    schema: {
      type: 'OBJECT',
      properties: { score: { type: 'INTEGER' }, hit: strArr, miss: strArr, comment: { type: 'STRING' } },
      required: ['score', 'hit', 'miss', 'comment'],
    },
  }),

  // 復習用の要約
  summarize: ({ note }) => ({
    prompt: `次の学習ノートを、スマホで復習しやすいように3〜5行の箇条書きで要約してください。1行は40文字以内。

ノート:
${note}`,
    schema: { type: 'OBJECT', properties: { lines: strArr }, required: ['lines'] },
  }),

  // 手書きノートの写真から用語と説明を抜き出す (画像も一緒に送る)。
  // 精度を優先するので、考える量はモデルの標準のまま (deep)、待つ時間も長めにする。
  // まず写真全体を書き起こし (transcript)、それを見ながら用語を選ぶ 2段階にしている。
  // (transcript は words より先に出力される = アルファベット順。並びを変えないこと)
  photo: ({ image, mime }) => ({
    image: { inlineData: { mimeType: mime, data: image } },
    deep: true,
    prompt: `この写真は学生の手書きノート (板書の写しやプリントへの書き込みを含む) です。

手順:
1. transcript: 写真に書かれている文字を、上から順にできるだけ正確に書き起こす。
   - 見出し・箇条書き・矢印 (→)・表・囲み・下線・色ペンで強調された語もすべて拾う
   - 傾き・影・崩し字があっても、前後の文脈と学習分野の用語として自然な読みを選ぶ
   - どうしても読めない文字は [?] と書く
2. words: transcript をもとに、学習用語とその説明の組を抜き出す。
   - 「用語：説明」「用語 = 説明」「用語 → 説明」「用語 (説明)」、表の行、用語の下に続く説明文などを組として扱う
   - 説明が写真に無い用語は入れない。写真に無い知識で説明を作らない
   - term は用語だけ (30文字以内)。desc は写真の説明を1〜2文にまとめる (100文字以内)
   - 同じ用語は1回だけ。最大30個。見つからなければ空の配列`,
    schema: {
      type: 'OBJECT',
      properties: {
        transcript: { type: 'STRING' },
        words: {
          type: 'ARRAY',
          items: { type: 'OBJECT', properties: { term: { type: 'STRING' }, desc: { type: 'STRING' } }, required: ['term', 'desc'] },
        },
      },
      required: ['transcript', 'words'],
    },
  }),
};

// 今日の呼び出し回数を1つ増やす。上限を超えていたら false (サーバーを起動している間だけ数える)
const today = { date: '', count: 0 };
function countToday() {
  const date = new Date().toLocaleDateString('sv-SE'); // 2026-11-20 の形 (サーバーの時刻で)
  if (today.date !== date) Object.assign(today, { date, count: 0 });
  if (today.count >= DAILY_LIMIT) return false;
  today.count++;
  return true;
}

// 他のサイトのページから、このAPIを勝手に呼ばせないための確認。
// ブラウザは別サイトから呼ぶと Origin に別のドメインを付けるので、それを断る。
// (Origin が無い呼び出し = npm run check など、ブラウザ以外は通す)
function fromOtherSite(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host !== new URL(request.url).host;
  } catch {
    return true;
  }
}

// ブラウザから POST /api/ai が来たときに呼ばれる本体
export async function POST(request) {
  // 開発版 (AI_MODE=real) 以外では動かさない。キーやモデル名が無いときも使えない
  if (process.env.AI_MODE !== 'real') return json({ error: 'disabled' }, 503);
  if (!process.env.GEMINI_API_KEY) return json({ error: 'no_key' }, 503);
  if (!MODEL) return json({ error: 'no_model' }, 503);
  if (fromOtherSite(request)) return json({ error: 'forbidden' }, 403);

  // 送られてきた JSON を読む
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_request' }, 400); }

  const task = TASKS[body?.task];
  if (!task) return json({ error: 'unknown_task' }, 400);

  // 入力を整える: 文字列にそろえ、長すぎるものは切り、問題数は 1〜15 に収める
  const input = {
    note: String(body.note ?? '').slice(0, MAX_NOTE),
    count: Math.min(Math.max(Number(body.count) || 5, 1), 15),
    term: String(body.term ?? '').slice(0, 100),
    desc: String(body.desc ?? '').slice(0, 1000),
    answer: String(body.answer ?? '').slice(0, 2000),
    image: String(body.image ?? ''),
    mime: String(body.mime ?? ''),
  };
  if (body.task === 'photo') {
    // 写真は種類・大きさ・中身が base64 の文字だけかを確かめる
    if (!IMAGE_TYPES.includes(input.mime)) return json({ error: 'bad_image' }, 400);
    if (!input.image || input.image.length > MAX_IMAGE) return json({ error: 'too_large' }, 413);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.image)) return json({ error: 'bad_image' }, 400);
  } else if (body.task !== 'check' && !input.note.trim()) {
    return json({ error: 'empty' }, 400);
  }

  // 1日の回数の上限。超えたら Gemini を呼ばずに断る (自分で決めた上限。日付が変わると戻る)
  if (!countToday()) return json({ error: 'rate_limited' }, 429);

  // Gemini に指示文 (と写真) を送り、決めた形の JSON で答えてもらう
  const { prompt, schema, image, deep } = task(input);
  const parts = image ? [image, { text: prompt }] : [{ text: prompt }];
  // 503 (混雑) や 500 は一時的なことが多いので、少し待って最大3回まで試す
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  const req = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        // 答える前に「考える」量を減らして速くする (このモデルは 'minimal' 不可、'low' は可)。
        // 写真 (deep) は精度を優先し、モデルの標準のまま考えさせる
        ...(!deep && { thinkingConfig: { thinkingLevel: 'low' } }),
      },
    }),
  };
  // 全体で limit ミリ秒まで。反応が止まっても、いつまでも待ち続けない
  const limit = deep ? TIME_LIMIT_DEEP : TIME_LIMIT;
  const deadline = Date.now() + limit;
  const signal = AbortSignal.timeout(limit);
  let res;
  for (let i = 0; i < 3; i++) {
    if (i) {
      // やり直す時間が残っていなければ、あきらめる
      if (deadline - Date.now() < 1500 * i + 10_000) break;
      await new Promise((r) => setTimeout(r, 1500 * i));
    }
    try {
      res = await fetch(url, { ...req, signal });
    } catch (e) {
      if (signal.aborted) return json({ error: 'timeout' }, 504);
      console.error('Gemini fetch failed', e);
      return json({ error: 'network' }, 502);
    }
    if (res.status !== 503 && res.status !== 500) break;
  }

  // 429 = 無料枠の回数制限。料金はかからず、時間をおけばまた使える
  if (res.status === 429) return json({ error: 'rate_limited' }, 429);
  if (res.status === 503 || res.status === 500) return json({ error: 'unavailable' }, 503);
  if (!res.ok) {
    // 中身はサーバーのログにだけ出す (ブラウザには error の種類だけ返す)
    console.error('Gemini error', res.status, (await res.text()).slice(0, 500));
    return json({ error: 'upstream' }, 502);
  }

  try {
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return json(JSON.parse(text));
  } catch {
    // 受け取りの途中で時間切れになったときも、ここに来る
    return json({ error: signal.aborted ? 'timeout' : 'bad_output' }, signal.aborted ? 504 : 502);
  }
}
