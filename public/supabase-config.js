// Supabase（ログインとノートの保存）の接続先。
// このファイルのままだと空 = ログインなし（ノートはこの端末の中だけに保存）で動く。
// npm run dev のときは開発用サーバーが .env.local の値からこのファイルを作って返す。
// 公開版（npm run build:demo）は、公開先に設定した値で書き出す。
// URL と publishable キーはブラウザに渡してよい値（守りは Supabase 側の RLS が受け持つ）。
export default {
  url: '',
  key: '',
};
