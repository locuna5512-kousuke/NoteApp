// APIキーが使えるかを確かめる (キーそのものは表示しない)
// 使い方: npm run check
import { POST } from './api/ai.js';

for (const [name, hint] of [['GEMINI_API_KEY', 'APIキー'], ['GEMINI_MODEL', '使うモデル名']]) {
  if (!process.env[name]) { console.log(`NG: .env.local に ${name} (${hint}) が入っていません`); process.exit(1); }
}
if (process.env.AI_MODE !== 'real') { console.log('NG: .env.local の AI_MODE が real ではありません (デモのままです)'); process.exit(1); }
console.log(`モデル: ${process.env.GEMINI_MODEL} に問い合わせ中…`);

const res = await POST(new Request('http://localhost/api/ai', {
  method: 'POST',
  body: JSON.stringify({ task: 'summarize', note: 'TCPはコネクション型で信頼性が高い。UDPはコネクションレス型で高速。' }),
}));
const data = await res.json();

const hints = {
  rate_limited: "回数の上限です (Gemini の上限か、DAILY_LIMIT)。時間をおいてから試してください",
  upstream: 'キーが間違っているか、モデル名が使えない可能性があります。上のエラー内容を見てください',
  unavailable: 'Gemini側が混み合っています。キーと設定は正しいので、少し時間をおいてもう一度試してください',
  network: 'インターネットに接続できませんでした',
  bad_output: 'AIの返事を読み取れませんでした。もう一度試してください',
};

if (res.ok) {
  console.log('OK: Gemini API が使えています！\n要約の例:');
  for (const l of data.lines) console.log('  ・' + String(l).replace(/^\s*[-・*•]\s*/, ''));
} else {
  console.log(`NG (${res.status} ${data.error}): ${hints[data.error] || ''}`);
  process.exit(1);
}
