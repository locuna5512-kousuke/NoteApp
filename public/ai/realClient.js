// 本物の AI。ブラウザから直接 AI のサービスは呼ばず、必ず自分のサーバー (api/ai) を経由する。
// API キーはサーバーだけが持つ。このファイルは公開版 (デモ) には含めない。
import { AiError } from './types.js';

export const isDemo = false;

// 画面の機能名 → サーバーの仕事名
const TASK = { summary: 'summarize', quiz: 'quiz', check: 'check', photo: 'photo' };

// サーバーの error → 画面に出す失敗の種類
const KIND = { rate_limited: 'rate_limit', network: 'network', timeout: 'network', unavailable: 'network' };

export async function generate({ feature, input, options = {} }) {
  const task = TASK[feature];
  if (!task) throw new AiError('unknown', 'unknown_feature');
  const body = typeof input === 'string' ? { note: input } : { ...input };
  if (feature === 'quiz') body.count = options.count;

  let res, data;
  try {
    res = await fetch('api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, ...body }),
    });
    data = await res.json();
  } catch {
    throw new AiError('network');
  }
  if (!res.ok) throw new AiError(KIND[data?.error] || 'unknown', data?.error || 'unknown');
  return data;
}
