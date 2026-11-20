// AI の切り替え口。画面はこのファイルだけを読み込む。
// 設定 (config.js) の mode が 'real' のときだけ本物、それ以外 (未設定・書き間違いも) はすべてデモ。
// 本物のクライアントは必要なときだけ読み込むので、公開版 (デモ) には含めなくても動く。
import config from './config.js';
import { chunked, toText } from './types.js';

export { AiError, ERROR_MESSAGES } from './types.js';

const client = config.mode === 'real'
  ? await import('./realClient.js')
  : await import('./mockClient.js');

// デモで動いているか (画面で「デモ表示」を付けるため)
export const isDemo = client.isDemo;

// 機能を1回動かして、{ data, text, isDemo } を返す。失敗したら AiError を投げる
export async function generate(request) {
  const data = await client.generate(request);
  return { data, text: toText(request.feature, data), isDemo };
}

// 文章の部分を少しずつ返す (AiOutput がタイピングのように表示する)。
// サーバーは一度に返すので、本物もデモも同じ速さで少しずつ出す
export async function* generateStream(request) {
  const { text } = await generate(request);
  yield* chunked(text, config.typingSpeed);
}

// generate で受け取った文章を、タイピング表示用に少しずつ返す
// (data と文章の両方を使う画面で、AI を2回呼ばずに済むように)
export const streamText = (text) => chunked(text, config.typingSpeed);
