// AI の入出力の形。本物のクライアントとデモ (mockClient) の両方がこの形を守る。
// 画面側は、どちらが動いているかを知らなくてよい。
//
// request = { feature, input, options }
//   feature: 'summary' (要約) | 'quiz' (テスト) | 'check' (説明チェック) | 'photo' (写真から用語)
//   input:
//     summary … ノート本文 (文字列)
//     quiz    … ノート本文 (文字列)。options.count で問題数 (1〜15)
//     check   … { term, desc, answer } (用語・ノートの説明・学生が書いた説明)
//     photo   … { image, mime } (base64 の写真と、その種類)
//
// generate(request) の戻り値 = { data, text, isDemo }
//   data:  機能ごとの中身
//     summary … { lines: string[] }
//     quiz    … { questions: [{ text, choices: string[4], answer }] }
//     check   … { score, hit: string[], miss: string[], comment }
//     photo   … { words: [{ term, desc }] }
//   text:  そのまま文章として見せる部分 (要約の箇条書き、説明チェックのひとこと)。無ければ ''
//   isDemo: デモ (サンプル出力) なら true
//
// generateStream(request) は text を少しずつ返す (for await で順に受け取る)。

export const FEATURES = ['summary', 'quiz', 'check', 'photo'];

// 失敗の種類は3つだけ。code にはサーバーが返した細かい理由 (too_large など) が入る
export class AiError extends Error {
  /** @param {'rate_limit'|'network'|'unknown'} kind */
  constructor(kind, code = kind) {
    super(code);
    this.name = 'AiError';
    this.kind = kind;
    this.code = code;
  }
}

// 失敗の種類ごとに画面に出す文
export const ERROR_MESSAGES = {
  rate_limit: '利用上限に達しました。時間をおいてから、もう一度試してください',
  network: 'AIにつながりませんでした。通信の状態を確かめて、もう一度試してください',
  unknown: 'うまく作れませんでした。もう一度試してください',
};

// 機能ごとに data から「文章として見せる部分」を作る
export function toText(feature, data) {
  // モデルによっては行の頭に「- 」「・」を付けてくるので、そろえてから「・」を付ける
  if (feature === 'summary') return (data.lines || []).map((l) => `・${String(l).replace(/^\s*[-・*•]\s*/, '')}`).join('\n');
  if (feature === 'check') return data.comment || '';
  return '';
}

// 文字列を少しずつ返す (タイピング表示用)。speed = 1文字あたりのミリ秒
export async function* chunked(text, speed) {
  const step = 2; // 一度に出す文字数
  for (let i = 0; i < text.length; i += step) {
    yield text.slice(i, i + step);
    if (speed > 0) await new Promise((r) => setTimeout(r, speed * step));
  }
}
