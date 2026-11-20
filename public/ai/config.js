// AI の設定。このファイルのままだと「デモ (mock)」で動く。
// npm run dev のときは、開発用サーバーが .env.local の AI_MODE / TYPING_SPEED から
// このファイルを作って返す。公開版 (npm run build:demo) は常に mock で書き出す。
export default {
  mode: 'mock',     // 'real' のときだけ本物の AI。それ以外はすべてデモ
  typingSpeed: 30,  // タイピング表示で、1文字にかける時間 (ミリ秒)
};
