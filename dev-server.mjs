// 手元で動かすための小さなサーバー
// 使い方:
//   npm run dev           開発版。public/ を配信し、/api/ai で Gemini を呼ぶ (.env.local の AI_MODE=real のとき)
//   npm run preview:demo  公開版の確認。npm run build:demo で作った dist/ をそのまま配信する (AI の通信なし)
//
// 配信するのは public/ (または dist/) の中だけ。
// プロジェクト直下の .env.local (APIキー) や api/ のコードは、ブラウザから読めない。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { POST } from './api/ai.js';

const PORT = Number(process.env.PORT) || 5173; // 開くポート番号
// npm run dev:lan のときは、同じWi-Fiの人からも開けるようにする
const HOST = process.argv.includes('--lan') ? '0.0.0.0' : '127.0.0.1';
const DEMO = process.argv.includes('--demo');  // 公開版 (dist/) の確認モード
const PUBLIC = join(process.cwd(), DEMO ? 'dist' : 'public'); // 配信するフォルダ (画面のファイルだけ)
// 開発版の AI 設定。画面には AI_MODE と TYPING_SPEED だけを渡す (キーやモデル名は渡さない)
const AI_CONFIG = `export default ${JSON.stringify({
  mode: process.env.AI_MODE === 'real' ? 'real' : 'mock',
  typingSpeed: Number(process.env.TYPING_SPEED) || 30,
})};
`;
// Supabase の接続先 (ログインとノートの保存)。URL と publishable キーはブラウザに渡してよい値
const SUPABASE_CONFIG = `export default ${JSON.stringify({
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
})};
`;
const MAX_BODY = 4_500_000;                // /api/ai に送れる大きさの上限 (Vercel と同じ 4.5MB)
// 拡張子ごとに、ブラウザへ伝えるファイルの種類。ここに無い拡張子は配信しない
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.json': 'application/json', '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // 開発版では、AI の設定ファイルを .env.local の値から作って返す
  if (!DEMO && url.pathname === '/ai/config.js') {
    res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' }).end(AI_CONFIG);
    return;
  }
  // Supabase の接続先も .env.local の値から作って返す
  if (!DEMO && url.pathname === '/supabase-config.js') {
    res.writeHead(200, { 'Content-Type': TYPES['.js'], 'Cache-Control': 'no-store' }).end(SUPABASE_CONFIG);
    return;
  }
  // /api/ai への POST は、api/ai.js の処理 (Gemini 呼び出し) に渡す。公開版の確認では使えない
  if (!DEMO && url.pathname === '/api/ai' && req.method === 'POST') {
    // 送られてきた本文を読み込む。大きすぎたら途中で断る
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY) { res.writeHead(413, { 'Content-Type': 'application/json' }).end('{"error":"too_large"}'); return; }
      chunks.push(c);
    }
    const r = await POST(new Request(url, { method: 'POST', headers: req.headers, body: Buffer.concat(chunks) }));
    res.writeHead(r.status, { 'Content-Type': 'application/json' });
    res.end(await r.text());
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }

  // それ以外は public/ のファイルを返す ("/" は index.html)
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end(); return; }
  const path = normalize(join(PUBLIC, pathname === '/' ? 'index.html' : pathname));
  // public/ の外 ("../" など)、"." で始まるファイル、知らない拡張子は読ませない
  const hidden = path.slice(PUBLIC.length).split(sep).some((p) => p.startsWith('.'));
  if (!path.startsWith(PUBLIC + sep) || hidden || !TYPES[extname(path)]) { res.writeHead(404).end('Not found'); return; }
  try {
    const file = await readFile(path);
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)], 'X-Content-Type-Options': 'nosniff' });
    res.end(file);
  } catch {
    // ファイルが無いときは 404
    res.writeHead(404).end('Not found');
  }
}).listen(PORT, HOST, async () => {
  console.log(DEMO ? '公開版 (dist/) の確認' : `開発版 (AI: ${process.env.AI_MODE === 'real' ? '本物' : 'デモ'})`);
  console.log(`このPC: http://localhost:${PORT}`);
  if (HOST === '0.0.0.0') {
    const { networkInterfaces } = await import('node:os');
    for (const list of Object.values(networkInterfaces()))
      for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`同じWi-Fiの人: http://${a.address}:${PORT}`);
  }
});
