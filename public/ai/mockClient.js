// デモ用の AI。外部への通信は一切しない。samples/ に保存したサンプル出力を返す。
// - 何を入力しても、その機能のサンプルを返す (入力に合わせたふりはしない)
// - 同じ機能のサンプルが複数あれば順番に返す
// - サンプルの無い機能は「サンプルはありません」と返す (エラーにはしない)
import { FEATURES } from './types.js';

export const isDemo = true;

const NO_SAMPLE = 'デモ版ではこの機能のサンプルはありません';

// サンプルはページを開いたときに、アプリの他のファイルと同じように読み込んでおく
// (AI の機能を使った瞬間には通信が起きない)
const samples = Object.fromEntries(await Promise.all(FEATURES.map(async (f) => {
  try {
    const res = await fetch(new URL(`./samples/${f}.json`, import.meta.url));
    return [f, res.ok ? (await res.json()).outputs || [] : []];
  } catch {
    return [f, []];
  }
})));
const turn = {}; // 機能ごとに、次に返すサンプルの番号

// 0.5〜1.5秒の「考え中」
const think = () => new Promise((r) => setTimeout(r, 500 + Math.random() * 1000));

// サンプルが無いときの中身 (機能ごとの形に合わせる)
const EMPTY = {
  summary: { lines: [NO_SAMPLE] },
  quiz: { questions: [], message: NO_SAMPLE },
  check: { score: 0, hit: [], miss: [], comment: NO_SAMPLE },
  photo: { words: [], message: NO_SAMPLE },
};

export async function generate({ feature }) {
  await think();
  const list = samples[feature] || [];
  if (!list.length) return structuredClone(EMPTY[feature] || { message: NO_SAMPLE });
  const i = turn[feature] || 0;
  turn[feature] = (i + 1) % list.length;
  return structuredClone(list[i]);
}
