// デモ用のサンプル出力を、本物の AI (開発版) で作って public/ai/samples/ に保存する。
// 使い方: node --env-file=.env.local scripts/make-samples.mjs
//   (別のモデルで作るとき: GEMINI_MODEL を一時的に上書きして実行する)
// - 入力は、アプリの初期データ「ネットワークの基礎」のノート (デモで最初に開くノート)
// - 同じ機能を2回ずつ動かし、デモでは順番に返す (毎回同じ文にならないように)
// - Gemini を 7 回呼ぶ (要約2・テスト2・説明チェック2・写真1)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

if (process.env.AI_MODE !== 'real') { console.error('NG: AI_MODE=real で実行してください (.env.local)'); process.exit(1); }
const { POST } = await import(pathToFileURL(join(process.cwd(), 'api/ai.js')).href);
const OUT = join(process.cwd(), 'public', 'ai', 'samples');

// public/app.js の初期データと同じノート
const NOTE = `# ネットワークの基礎

## プロトコル
- **TCP**: 通信相手との接続を確立し、データの到達と順序を保証するプロトコル
- **UDP**: 接続を確立せずに送信する、速度を優先した軽量なプロトコル
- **HTTP**: ブラウザとサーバの間でWebページをやり取りするプロトコル
- **DNS**: ドメイン名をIPアドレスに変換する仕組み

## アドレス
- **IPアドレス**: ネットワーク上の機器を識別する番号
- **MACアドレス**: 機器に製造時から割り当てられている固有の番号
- **サブネットマスク**: IPアドレスのネットワーク部とホスト部を区切る値
- **DHCP**: 機器にIPアドレスを自動で割り当てる仕組み

> 動画配信や通話は多少欠けても速いほうがいい → UDP`;

async function run(task, body) {
  const res = await POST(new Request('http://localhost/api/ai', { method: 'POST', body: JSON.stringify({ task, ...body }) }));
  const data = await res.json();
  if (!res.ok) throw new Error(`${task}: ${res.status} ${data.error}`);
  process.stdout.write(`  ${task} OK\n`);
  return data;
}

const checkInputs = [
  { term: 'TCP', desc: '通信相手との接続を確立し、データの到達と順序を保証するプロトコル', answer: '相手とつながってから送るので、データがちゃんと届くプロトコル' },
  { term: 'DNS', desc: 'ドメイン名をIPアドレスに変換する仕組み', answer: 'ドメイン名をIPアドレスに変える仕組み。住所録のようなもの' },
];
const image = (await readFile(join(process.cwd(), 'scripts', 'sample-photo.jpg'))).toString('base64');

console.log(`モデル: ${process.env.GEMINI_MODEL}`);
const samples = {
  summary: { input: NOTE, outputs: [await run('summarize', { note: NOTE }), await run('summarize', { note: NOTE })] },
  quiz: { input: NOTE, outputs: [await run('quiz', { note: NOTE, count: 15 }), await run('quiz', { note: NOTE, count: 15 })] },
  check: { input: checkInputs, outputs: await Promise.all(checkInputs.map((c) => run('check', c))) },
  photo: {
    input: 'scripts/sample-photo.jpg (OSI参照モデルと伝送制御の手書き風ノート)',
    outputs: [await run('photo', { image, mime: 'image/jpeg' })].map(({ transcript, ...rest }) => rest),
  },
};

await mkdir(OUT, { recursive: true });
for (const [feature, s] of Object.entries(samples)) {
  await writeFile(join(OUT, `${feature}.json`), JSON.stringify({ feature, ...s }, null, 2) + '\n');
}
console.log(`OK: ${Object.keys(samples).length} 機能のサンプルを public/ai/samples/ に保存しました`);
