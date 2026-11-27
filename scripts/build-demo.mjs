// 公開版 (デモ) を dist/ に書き出す。使い方: npm run build:demo
// - public/ をコピーする。ただし本物の AI を呼ぶ ai/realClient.js は入れない
// - ai/index.js から本物を読み込む部分を消し、ai/config.js を mock で書き出す
// - できあがった dist/ に、AI の接続先・キー・本物のクライアントが残っていないか調べる。残っていたら失敗にする
import { cp, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'public');
const OUT = join(ROOT, 'dist');
const fail = (msg) => { console.error(`NG: ${msg}`); process.exit(1); };

// 公開版を本物の AI で作ろうとしていたら止める
if (process.env.AI_MODE === 'real') fail('AI_MODE=real のまま公開版を作ろうとしています。公開先では AI_MODE=mock にしてください');

// 1) コピー (本物のクライアントは除く)
await rm(OUT, { recursive: true, force: true });
await cp(SRC, OUT, {
  recursive: true,
  // 本物のクライアントと、"." で始まるファイル・フォルダは入れない
  filter: (p) => {
    const rel = relative(SRC, p);
    return rel !== join('ai', 'realClient.js') && !rel.split(/[\\/]/).some((part) => part.startsWith('.'));
  },
});

// 2) 切り替え口から本物の読み込みを消す
const indexPath = join(OUT, 'ai', 'index.js');
const index = await readFile(indexPath, 'utf8');
const realBranch = /const client = config\.mode === 'real'\s*\?\s*await import\('\.\/realClient\.js'\)\s*:\s*await import\('\.\/mockClient\.js'\);/;
if (!realBranch.test(index)) fail('ai/index.js の切り替え部分が見つかりません (書き方を変えたら build-demo.mjs も直してください)');
await writeFile(indexPath, index.replace(realBranch, "const client = await import('./mockClient.js'); // 公開版はデモだけ"));

// 3) 設定は必ずデモ
const typingSpeed = Number(process.env.TYPING_SPEED) || 30;
await writeFile(join(OUT, 'ai', 'config.js'),
  `// 公開版 (npm run build:demo で作成)。AI は常にデモ\nexport default ${JSON.stringify({ mode: 'mock', typingSpeed })};\n`);

// 3.5) Supabase の接続先 (ログインとノートの保存)。公開先の環境変数から書き出す。
// 設定が無ければ空のまま = ログインなしで動く。URL と publishable キーはブラウザに渡してよい値
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
if (supabaseKey.startsWith('sb_secret_')) fail('Supabase の secret キーが設定されています。publishable キーにしてください');
await writeFile(join(OUT, 'supabase-config.js'),
  `// 公開版 (npm run build:demo で作成)\nexport default ${JSON.stringify({ url: supabaseUrl, key: supabaseKey })};\n`);
if (!supabaseUrl || !supabaseKey) console.warn('注意: Supabase の設定が無いので、公開版はログインなし (端末の中だけに保存) で動きます');

// 4) 残っていてはいけないものを探す
const banned = [/gemini/i, /API_KEY/, /generativelanguage/i, /realClient/, /api\/ai/];
// 手元に .env.local があれば、キーの値そのものも探す (値は表示しない)
if (existsSync(join(ROOT, '.env.local'))) {
  const m = (await readFile(join(ROOT, '.env.local'), 'utf8')).match(/^GEMINI_API_KEY=(.+)$/m);
  const key = m?.[1].trim().replace(/^["']|["']$/g, '');
  if (key) banned.push({ test: (s) => s.includes(key), toString: () => '(APIキーの値)' });
}
const files = (await readdir(OUT, { recursive: true, withFileTypes: true }))
  .filter((d) => d.isFile()).map((d) => join(d.parentPath ?? d.path, d.name));
for (const f of files) {
  const text = await readFile(f, 'utf8').catch(() => '');
  for (const b of banned) if (b.test(text)) fail(`${relative(ROOT, f)} に ${b} が入っています`);
}
if (existsSync(join(OUT, 'ai', 'realClient.js'))) fail('dist に realClient.js があります');

console.log(`OK: 公開版を dist/ に書き出しました (${files.length} ファイル、AI はデモ、接続先・キーなし)`);
