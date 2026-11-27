// Supabase とのつなぎ役（ログインとノートの保存）。ノート画面・ホーム画面・ログイン画面が使う。
//
// しくみ:
// - 画面はこれまでどおり localStorage (noteapp.v2) を読み書きする
// - ログイン中なら、ページを開いたときに Supabase の内容を localStorage に写してから画面を作る (start)
// - 保存のたびに、同じ内容を少し待ってから Supabase にも送る (push)
// - ログインしていない・Supabase の設定が無いときは、これまでどおりこの端末の中だけに保存する
//
// Supabase 側の表は supabase/notebooks.sql。1人1行で、data に noteapp.v2 と同じ JSON を入れる。
import config from './supabase-config.js';

// supabase-js はバージョンを固定して CDN から読み込む（npm は使っていないため）
const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/+esm';
const TABLE = 'notebooks';
const OWNER_KEY = 'noteapp.owner'; // localStorage の中身が誰のものか (ユーザーID)
const PUSH_DELAY = 1200;           // 入力が止まってから送るまでの時間 (ミリ秒)

// 設定があるときだけ Supabase を使う
export const enabled = !!(config.url && config.key);

let client = null;
if (enabled) {
  try {
    const { createClient } = await import(SUPABASE_JS);
    client = createClient(config.url, config.key);
  } catch (e) {
    console.error('Supabase を読み込めませんでした', e);
  }
}
export const supabase = client;

// ログイン中のユーザー (start のあとに入る。未ログインなら null)
export let user = null;
// この端末の内容を Supabase に送ってよいか (読み込みに成功したときだけ true)
let canPush = false;
// Supabase にまだ行が無かった (= 初めてログインした) か
export let firstTime = false;
// ログイン前にこの端末で書いたノートを、Supabase のノートと合わせたか
export let merged = false;

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 保存できなくても動かす */ } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch { /* 同上 */ } };

// ログイン中のユーザーを返す (未ログイン・設定なしなら null)
export async function currentUser() {
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session?.user ?? null;
}

// ページを開いたときに1回だけ呼ぶ。ログイン中なら Supabase の内容を localStorage に写す。
// 戻り値: 'guest' (未ログイン) / 'synced' (読み込めた) / 'offline' (読めなかった。この回は送らない)
export async function start(storageKey) {
  user = await currentUser();
  if (!user) return 'guest';

  const { data: row, error } = await client.from(TABLE).select('data').eq('user_id', user.id).maybeSingle();
  if (error) {
    // 読めなかったときに送ると、Supabase の新しい内容を古い内容で上書きしてしまうので送らない
    console.error('Supabase から読み込めませんでした', error);
    return 'offline';
  }

  const owner = lsGet(OWNER_KEY);
  if (row) {
    // この端末に「ログインせずに書いたノート」(持ち主の記録なし) があれば、消さずに合わせる。
    // 本人のノートの写し (持ち主 = 本人) なら Supabase を正とする (ほかの端末で消したノートを戻さないため)
    const local = owner ? null : parse(lsGet(storageKey));
    const data = local ? mergeNotebooks(row.data, local) : row.data;
    merged = !!local && JSON.stringify(data) !== JSON.stringify(row.data);
    lsSet(storageKey, JSON.stringify(data));
  } else {
    firstTime = true;
    // 初めてのログイン。この端末のノートがほかの人のものなら引き継がない (サンプルから始める)
    if (owner && owner !== user.id) lsDel(storageKey);
  }
  lsSet(OWNER_KEY, user.id);
  canPush = true;
  return 'synced';
}

// localStorage の文字列を読む。形が違えば null
function parse(text) {
  try {
    const v = JSON.parse(text);
    return v && Array.isArray(v.subjects) && Array.isArray(v.notes) ? v : null;
  } catch {
    return null;
  }
}

// Supabase のノート (remote) に、この端末のノート (local) を足し合わせる。何も消さない。
// - 科目・単元: ID が同じなら Supabase のものを使い、この端末にしか無いものを足す
// - ノート: ID が同じなら更新日が新しいほう (同じ日なら Supabase)。この端末にしか無いものは足す
function mergeNotebooks(remote, local) {
  const subjects = structuredClone(remote.subjects);
  for (const ls of local.subjects) {
    const rs = subjects.find((s) => s.id === ls.id);
    if (!rs) { subjects.push(structuredClone(ls)); continue; }
    rs.units ??= [];
    for (const u of ls.units || []) if (!rs.units.some((x) => x.id === u.id)) rs.units.push(structuredClone(u));
  }
  const notes = structuredClone(remote.notes);
  for (const ln of local.notes) {
    const i = notes.findIndex((n) => n.id === ln.id);
    if (i < 0) notes.push(structuredClone(ln));
    else if ((ln.updated || '') > (notes[i].updated || '')) notes[i] = structuredClone(ln);
  }
  return { ...remote, subjects, notes, name: remote.name || local.name || '' };
}

// 保存の内容を Supabase に送る (続けて呼ばれたら最後の1回だけ送る)
let timer = null;
let pending = null;
export function push(data) {
  if (!canPush) return;
  pending = data;
  clearTimeout(timer);
  timer = setTimeout(flush, PUSH_DELAY);
}

// 待っている内容があれば、すぐに送る
export async function flush() {
  clearTimeout(timer);
  if (!canPush || !pending) return;
  const data = pending;
  pending = null;
  const { error } = await client.from(TABLE).upsert({ user_id: user.id, data, updated_at: new Date().toISOString() });
  if (error) {
    console.error('Supabase に保存できませんでした', error);
    window.dispatchEvent(new CustomEvent('cloud-save-error'));
  }
}

// 画面を離れるときは、待たずに送る
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
addEventListener('pagehide', () => { flush(); });

// ログアウト。送り残しを送ってから、この端末に残っているノートを消す (共用の PC に残さないため)
export async function signOut(storageKey) {
  await flush();
  if (client) await client.auth.signOut();
  lsDel(storageKey);
  lsDel(OWNER_KEY);
  canPush = false;
  user = null;
}
