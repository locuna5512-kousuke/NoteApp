// AI の出力を見せる共通の部品。本物でもデモでも同じ動きにする:
// 「考え中…」→ 文字が少しずつ出る (タイピング表示) → デモならデモ表記
import { demoBadge } from './DemoBadge.js';

// 「考え中…」を出す (経過秒数も出せる)
export function showThinking(el, label = '考え中…') {
  const p = document.createElement('p');
  p.className = 'loading';
  p.textContent = label;
  el.replaceChildren(p);
  return p;
}

// stream (generateStream の戻り値) を順に表示し、終わったらデモ表記を付ける。
// 最初の文字が届くまでは「考え中…」のまま。失敗したら AiError を投げる
export async function streamInto(el, stream, { isDemo }) {
  const out = document.createElement('div');
  out.className = 'ai-output';
  let started = false;
  for await (const chunk of stream) {
    if (!started) { el.replaceChildren(out); started = true; }
    out.textContent += chunk;
  }
  if (!started) el.replaceChildren(out);
  addDemoBadge(el, isDemo);
  return out;
}

// 文章以外の出力 (テストの問題、写真の単語) の下にもデモ表記を付けるとき
export function addDemoBadge(el, isDemo) {
  if (isDemo && !el.querySelector(':scope > .demo-badge')) el.append(demoBadge());
}
