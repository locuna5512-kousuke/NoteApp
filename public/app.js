// AIといっしょ — 画面の処理 (画面設計書「PC版 (ラベンダー)」)
//
// 1枚のページの中で、URL の # の部分で画面を切り替える:
//   #/home                 ホーム
//   #/note/<id>            ノート編集 (Markdown + プレビュー、自動保存)
//   #/note/<id>/ai         AIに聞く (要約 / 確認問題 5〜15問)
//   #/unit/<科目>/<単元>   単元を開く (最初のノートへ)
//   #/review               今日の復習 (1・3・7・14・30日の間隔)
//   #/search?q=…           検索
//   #/trash                ゴミ箱
//
// AI は ai/index.js だけを通して呼ぶ (本物かデモかはそちらが決める)。
// 保存は localStorage (noteapp.v2)。ログイン中は cloud.js が Supabase にも送る。

import * as ai from './ai/index.js';
import { showThinking, streamInto } from './components/AiOutput.js';
import * as cloud from './cloud.js';

const STORAGE_KEY = 'noteapp.v2';
const OLD_STORAGE_KEY = 'noteapp.v1';
const INTERVALS = [1, 3, 7, 14, 30]; // 復習の間隔 (日)
const MAX_CHARS = 100_000;           // 1ノートの文字数の上限
const SEARCH_LIMIT = 50;

// ログイン中なら、Supabase の内容を localStorage に写してから画面を作る
await cloud.start(STORAGE_KEY);

// ---------- 日付 ----------
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const addDays = (dateStr, n) => { const d = new Date(`${dateStr}T00:00:00`); d.setDate(d.getDate() + n); return ymd(d); };
const WEEK = '日月火水木金土';
const jpDate = (d = new Date()) => `${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}）`;
const hhmm = (d) => `${d.getHours()}:${pad(d.getMinutes())}`;
// 「今日 10:15」「昨日」「11/22」
function when(note) {
  const t = note.updatedAt ? new Date(note.updatedAt) : null;
  const day = t ? ymd(t) : note.updated;
  if (!day) return '';
  if (day === today()) return t ? `今日 ${hhmm(t)}` : '今日';
  if (day === addDays(today(), -1)) return '昨日';
  const [, m, d] = day.split('-');
  return `${Number(m)}/${Number(d)}`;
}

// ---------- サンプル (初めて開いたとき) ----------
function sampleData() {
  const t = today();
  const at = (daysAgo, h, m) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(h, m, 0, 0); return d.toISOString(); };
  const note = (id, subjectId, unitId, title, body, daysAgo, h, m, review) =>
    ({ id, subjectId, unitId, title, body, updated: addDays(t, -daysAgo), updatedAt: at(daysAgo, h, m), version: 1, ...(review ? { review } : {}) });
  return {
    name: '',
    subjects: [
      { id: 's1', name: 'データベース', open: true, units: [
        { id: 'u1', name: '第1回 ER 図' }, { id: 'u2', name: '第2回 正規化' }, { id: 'u3', name: '第3回 SQL 基礎' }] },
      { id: 's2', name: 'ネットワーク', open: false, units: [{ id: 'u4', name: '第1回 OSI 参照モデル' }] },
      { id: 's3', name: 'Web プログラミング', open: false, units: [{ id: 'u5', name: '第1回 HTTP' }] },
      { id: 's4', name: 'ビジネス英語', open: false, units: [{ id: 'u6', name: 'メール' }] },
    ],
    notes: [
      note('n1', 's1', 'u2', '第2正規形', `## 条件
- 第1正規形であること
- 主キーの一部だけで決まる列（部分関数従属）がないこと

## 例
受講(**学籍番号, 科目ID**, 氏名, 成績)
→ 氏名は学籍番号だけで決まる
→ 学生(**学籍番号**, 氏名) に分ける

## メモ
- 主キーが1列なら部分関数従属は起きない
- 次回：第3正規形（推移的関数従属）`, 0, 10, 15, { stage: 2, due: t, last: null }),
      note('n2', 's1', 'u2', '第1正規形', `## 条件
- 1つのセルに1つの値だけが入っていること
- 繰り返し項目を別の行に分ける。正規化の最初のステップ

## 用語
- **原子値**: それ以上分けられない値
- **繰り返し項目**: 1行の中に同じ種類の値が並ぶこと`, 2, 16, 40, { stage: 1, due: addDays(t, 1), last: addDays(t, -2) }),
      note('n3', 's1', 'u2', '正規化とは', `表を分けて、同じデータを何度も持たないように整理すること。

- **正規化**: データの重複をなくすために表を分割する設計手法
- **更新時異常**: 重複したデータの一部だけが書き換わって食い違うこと`, 7, 9, 30),
      note('n4', 's1', 'u1', 'ER 図の書き方', `- **エンティティ**: 管理したい「もの」。四角で書く
- **リレーションシップ**: エンティティ同士の関係
- **カーディナリティ**: 1対多・多対多などの対応の数`, 9, 13, 0),
      note('n5', 's2', 'u4', 'OSI 参照モデル', `## 7つの層
- **物理層**: ビット列を電気信号や光に変えて送る
- **データリンク層**: 隣り合う機器同士の通信
- **ネットワーク層**: 宛先までの経路を選ぶ
- **トランスポート層**: 通信の信頼性を確保する

> 覚え方：「アプセトネデブ」（上から）`, 1, 20, 10, { stage: 1, due: t, last: null }),
      note('n6', 's3', 'u5', 'GET と POST', `- **GET**: データを取りに行く。条件は URL に付く
- **POST**: データを送る。中身はリクエストの本文に入る
- フォームの送信は基本 POST`, 5, 11, 0, { stage: 0, due: t, last: null }),
      note('n7', 's4', 'u6', 'メールの定型表現', `- **I hope this email finds you well.**: 書き出しのあいさつ
- **Please find attached ...**: 添付のご案内
- **I look forward to hearing from you.**: 結びのあいさつ`, 3, 18, 0, { stage: 2, due: addDays(t, 7), last: t }),
    ],
  };
}

// ---------- 状態 ----------
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function load() {
  try {
    const v2 = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (v2 && Array.isArray(v2.subjects)) return v2;
    const v1 = JSON.parse(localStorage.getItem(OLD_STORAGE_KEY));
    if (v1 && Array.isArray(v1.notes)) return migrateV1(v1);
  } catch { /* 読めなければサンプルから始める */ }
  return null;
}

// 旧データ: note.folder (文字列) → 科目にして、ノートは科目の直下に置く
function migrateV1(old) {
  const subjects = [];
  const byName = {};
  for (const n of old.notes) {
    const name = n.folder || 'ノート';
    if (!byName[name]) { byName[name] = { id: uid('s'), name, open: true, units: [] }; subjects.push(byName[name]); }
    n.subjectId = byName[name].id;
    n.unitId = null;
    delete n.folder;
  }
  return { subjects, notes: old.notes, name: old.name || '' };
}

const state = load() || sampleData();
for (const s of state.subjects) s.units ??= [];
for (const n of state.notes) n.body ??= '';

function save() {
  const data = { subjects: state.subjects, notes: state.notes, name: state.name || '' };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* 保存できなくても動かす */ }
  cloud.push(data);
}
if (cloud.firstTime || cloud.merged) save();

// いま見ている科目・単元 (「新しいノート」を作る場所)
const sel = { subjectId: state.subjects[0]?.id ?? null, unitId: state.subjects[0]?.units[0]?.id ?? null };

// ---------- 小さな関数 ----------
const $ = (s, root = document) => root.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (id) => `<svg class="i" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const live = () => state.notes.filter((n) => !n.trashed);
const findNote = (id) => state.notes.find((n) => n.id === id);
const findSubject = (id) => state.subjects.find((s) => s.id === id);
const findUnit = (s, id) => s?.units.find((u) => u.id === id);
const byNewest = (a, b) => (b.updatedAt || b.updated || '').localeCompare(a.updatedAt || a.updated || '');
const notesIn = (sid, unitId) => live().filter((n) => n.subjectId === sid && (n.unitId || null) === (unitId || null)).sort(byNewest);
const pathOf = (n) => { const s = findSubject(n.subjectId); const u = findUnit(s, n.unitId); return [s?.name ?? '未分類', u?.name].filter(Boolean); };
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// 科目の色 (並び順で 紫 / セージ / テラコッタ / ローズ …)
const COLORS = [['--accent', '--accent-soft'], ['--sage', '--sage-soft'], ['--terra', '--terra-soft'], ['--rose', '--rose-soft']];
function colorOf(subjectId) {
  const i = Math.max(0, state.subjects.findIndex((s) => s.id === subjectId));
  const [c, soft] = COLORS[i % COLORS.length];
  return `--c: var(${c}); --soft: var(${soft});`;
}

// Markdown の記号を外した文 (抜粋・検索用)
const plain = (md) => md.replace(/```[\s\S]*?```/g, ' ').replace(/^#{1,6}\s+/gm, '').replace(/^\s*(?:[-*]|\d+\.)\s+(?:\[[ x]\]\s+)?/gm, '')
  .replace(/^>\s?/gm, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\s*\n\s*/g, ' ').trim();

// ---------- Markdown → HTML (見出し・箇条書き・番号・引用・コード・太字) ----------
function inline(s) {
  return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
function renderMarkdown(src) {
  const out = [];
  let list = null, para = [], code = null;
  const flushPara = () => { if (para.length) { out.push(`<p>${para.join('<br>')}</p>`); para = []; } };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of src.split('\n')) {
    if (code) {
      if (line.startsWith('```')) { out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); code = null; } else code.push(line);
      continue;
    }
    let m;
    if (line.startsWith('```')) { flushPara(); closeList(); code = []; }
    else if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flushPara(); closeList(); const lv = m[1].length + 1; out.push(`<h${lv}>${inline(m[2])}</h${lv}>`); }
    else if ((m = line.match(/^\s*(?:[-*]|(\d+)\.)\s+(.*)$/))) {
      flushPara();
      const type = m[1] ? 'ol' : 'ul';
      if (list !== type) { closeList(); out.push(`<${type}>`); list = type; }
      out.push(`<li>${inline(m[2].replace(/^\[[ x]\]\s+/, ''))}</li>`);
    }
    else if ((m = line.match(/^>\s?(.*)$/))) { flushPara(); closeList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
    else if (!line.trim()) { flushPara(); closeList(); }
    else { closeList(); para.push(inline(line)); }
  }
  if (code) out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
  flushPara(); closeList();
  return out.join('\n') || '<p class="empty">まだ何も書かれていません</p>';
}

// ---------- 復習 ----------
// 今日の復習に出すノート (復習日が今日まで、または今日すでに答えたもの)。科目順
function todayReviews() {
  const t = today();
  const order = (n) => state.subjects.findIndex((s) => s.id === n.subjectId);
  return live().filter((n) => n.review && (n.review.due <= t || n.review.last === t))
    .sort((a, b) => order(a) - order(b) || a.title.localeCompare(b.title, 'ja'));
}
const isDoneToday = (n) => n.review?.last === today() && n.review.due > today();

// ---------- 画面の切り替え ----------
const view = $('#view');
let cleanup = null; // 画面を離れるときにやること (編集中の保存など)

function parseRoute() {
  const raw = location.hash.slice(1);
  // 以前の形 (index.html#n1 / #new) にも対応する
  if (raw === 'new') return { name: 'new' };
  if (raw && !raw.startsWith('/')) return { name: 'note', id: raw };
  const [path, query = ''] = (raw || '/home').split('?');
  const p = path.split('/').filter(Boolean);
  const q = new URLSearchParams(query);
  if (p[0] === 'note' && p[1]) return { name: p[2] === 'ai' ? 'ai' : 'note', id: p[1] };
  if (p[0] === 'unit') return { name: 'unit', sid: p[1], uid: p[2] === '_' ? null : p[2] };
  if (p[0] === 'review') return { name: 'review' };
  if (p[0] === 'search') return { name: 'search', q: q.get('q') || '' };
  if (p[0] === 'trash') return { name: 'trash' };
  return { name: 'home' };
}
const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };

function render() {
  cleanup?.();
  cleanup = null;
  closeMenu();
  document.body.classList.remove('side-open');
  const r = parseRoute();
  if (r.name === 'new') { addNote(sel.subjectId, sel.unitId, true); return; }
  if (r.name === 'note' || r.name === 'ai') {
    const n = findNote(r.id);
    if (!n || n.trashed) { go('#/home'); return; }
    sel.subjectId = n.subjectId; sel.unitId = n.unitId || null;
  }
  if (r.name === 'unit') {
    const first = notesIn(r.sid, r.uid)[0];
    sel.subjectId = r.sid; sel.unitId = r.uid;
    if (first) { history.replaceState(null, '', `#/note/${first.id}`); r.name = 'note'; r.id = first.id; }
  }
  renderSide(r);
  view.scrollTop = 0;
  ({ home: renderHome, note: renderNote, unit: renderNote, ai: renderAi, review: renderReview, search: renderSearch, trash: renderTrash })[r.name](r);
}
addEventListener('hashchange', render);

// =========================================================
// サイドバー
// =========================================================
function renderSide(r = parseRoute()) {
  const cur = r.name === 'unit' || r.name === 'note' || r.name === 'ai' ? sel : null;
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const on = a.dataset.nav === r.name;
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const left = todayReviews().filter((n) => !isDoneToday(n)).length;
  for (const b of [$('#reviewBadge'), $('#reviewBadge2')]) { b.textContent = left; b.hidden = !left; }

  const tree = $('#tree');
  if (!state.subjects.length) { tree.innerHTML = '<li class="tree-empty">「＋」で科目を追加</li>'; return; }
  tree.innerHTML = state.subjects.map((s) => {
    const loose = notesIn(s.id, null).length;
    const units = [...s.units.map((u) => ({ id: u.id, name: u.name })), ...(loose ? [{ id: null, name: '単元なし' }] : [])];
    const active = cur?.subjectId === s.id;
    return `<li class="t-subject${active ? ' is-active' : ''}" style="${colorOf(s.id)}">
      <div class="t-row" data-drop-subject="${s.id}">
        <button class="t-main" type="button" data-toggle="${s.id}" aria-expanded="${!!s.open}"><span class="dot"></span><span class="t-name">${esc(s.name)}</span></button>
        <button class="icon-btn t-more" type="button" data-menu-subject="${s.id}" aria-label="${esc(s.name)} のメニュー" aria-haspopup="menu">${icon('more')}</button>
      </div>
      ${s.open ? `<ul class="t-units">${units.map((u) => `
        <li class="t-unit${active && (cur.unitId || null) === u.id ? ' is-current' : ''}">
          <div class="t-row" data-drop-subject="${s.id}" data-drop-unit="${u.id ?? ''}">
            <a class="t-main" href="#/unit/${s.id}/${u.id ?? '_'}"><span class="t-name">${esc(u.name)}</span></a>
            ${u.id ? `<button class="icon-btn t-more" type="button" data-menu-unit="${s.id}/${u.id}" aria-label="${esc(u.name)} のメニュー" aria-haspopup="menu">${icon('more')}</button>` : ''}
          </div></li>`).join('') || '<li class="tree-empty">単元はまだありません</li>'}</ul>` : ''}
    </li>`;
  }).join('');
}

$('#tree').addEventListener('click', (e) => {
  const t = e.target.closest('[data-toggle]');
  if (t) {
    const s = findSubject(t.dataset.toggle);
    s.open = !s.open;
    save();
    renderSide();
    return;
  }
  const ms = e.target.closest('[data-menu-subject]');
  if (ms) {
    const sid = ms.dataset.menuSubject;
    openMenu(ms, [
      ['plus', '単元を追加', () => addUnit(sid)],
      ['pencil', '名前を変更', () => renameSubject(sid)],
      null,
      ['trash', '科目を削除', () => deleteSubject(sid), 'danger'],
    ]);
    return;
  }
  const mu = e.target.closest('[data-menu-unit]');
  if (mu) {
    const [sid, id] = mu.dataset.menuUnit.split('/');
    openMenu(mu, [
      ['plus', 'この単元にノートを追加', () => addNote(sid, id, true)],
      ['pencil', '名前を変更', () => renameUnit(sid, id)],
      null,
      ['trash', '単元を削除', () => deleteUnit(sid, id), 'danger'],
    ]);
  }
});

// ノート一覧のノートを、サイドバーの単元へドラッグして移動できる (PC)
let dragId = null;
const clearDrop = () => document.querySelectorAll('.drop-over').forEach((el) => el.classList.remove('drop-over'));
document.addEventListener('dragstart', (e) => {
  const it = e.target.closest?.('[data-note]');
  if (!it) return;
  dragId = it.dataset.note;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
});
document.addEventListener('dragend', () => { dragId = null; clearDrop(); });
$('#tree').addEventListener('dragover', (e) => {
  const row = e.target.closest('[data-drop-subject]');
  if (!dragId || !row) return;
  e.preventDefault();
  clearDrop();
  row.classList.add('drop-over');
});
$('#tree').addEventListener('dragleave', (e) => { if (!e.currentTarget.contains(e.relatedTarget)) clearDrop(); });
$('#tree').addEventListener('drop', (e) => {
  const row = e.target.closest('[data-drop-subject]');
  if (!dragId || !row) return;
  e.preventDefault();
  moveNoteTo(dragId, row.dataset.dropSubject, row.dataset.dropUnit || null);
  clearDrop();
});

$('#newNoteBtn').addEventListener('click', () => addNote(sel.subjectId, sel.unitId, true));
$('#addSubjectBtn').addEventListener('click', () => addSubject());
$('#sideToggle').addEventListener('click', () => document.body.classList.toggle('side-open'));
document.addEventListener('click', (e) => {
  if (document.body.classList.contains('side-open') && !e.target.closest('#side, #sideToggle, .menu, dialog')) document.body.classList.remove('side-open');
});

// アカウント
function renderAccount() {
  const email = cloud.user?.email;
  $('#avatar').textContent = (email || 'A').slice(0, 1).toUpperCase();
  $('#accountLabel').textContent = email ? email.split('@')[0] : 'アカウント';
}
$('#accountBtn').addEventListener('click', (e) => {
  const email = cloud.user?.email;
  openMenu(e.currentTarget, email
    ? [[null, `${email} でログイン中`], null, ['logout', 'ログアウト', async () => { await cloud.signOut(STORAGE_KEY); location.href = 'login.html'; }]]
    : [[null, cloud.enabled ? 'ログインしていません（この端末だけに保存）' : 'この端末だけに保存しています'],
       ...(cloud.enabled ? [null, ['arrow', 'ログインする', () => { location.href = 'login.html'; }]] : [])]);
});

// =========================================================
// ホーム
// =========================================================
function renderHome() {
  const list = todayReviews();
  const done = list.filter(isDoneToday).length;
  const notes = live();
  const reviewing = notes.filter((n) => n.review).length;
  const recent = [...notes].sort(byNewest).slice(0, 3);
  const firstLeft = list.find((n) => !isDoneToday(n));
  const R = 31, C = 2 * Math.PI * R;
  const ratio = notes.length ? reviewing / notes.length : 0;

  view.innerHTML = `<div class="deco"></div>
  <div class="page">
    <div class="home-head">
      <div><p class="date-line">${jpDate()}</p><h1 class="page-title">こんにちは、今日も一歩ずつ</h1></div>
      <form class="searchbox" id="homeSearch" role="search">${icon('search')}<input type="search" name="q" placeholder="ノートを検索" aria-label="ノートを検索"></form>
    </div>
    <div class="home-grid">
      <section class="card review-card" aria-label="今日の復習">
        <div class="card-head"><h2>${icon('target')}今日の復習</h2><span class="count num">${done} / ${list.length} 完了</span></div>
        <div class="bar sage"><i style="width:${list.length ? (done / list.length) * 100 : 0}%"></i></div>
        ${list.length ? `<ul class="today-list">${list.map((n) => `
          <li class="${isDoneToday(n) ? 'is-done' : ''}"><span class="check-dot">${isDoneToday(n) ? icon('check') : ''}</span>
            <a href="#/note/${n.id}">${esc(n.title || '無題のノート')}</a><span class="subj">${esc(pathOf(n)[0])}</span></li>`).join('')}</ul>`
        : '<p class="empty-line">今日の復習はありません。ノートの「復習リスト」をオンにすると、ここに出ます。</p>'}
        ${firstLeft ? `<a class="btn btn-primary" href="#/review">続きから復習する ${icon('arrow')}</a>` : list.length ? '<p class="hint">今日の分はおわりました。おつかれさま！</p>' : ''}
      </section>
      <section class="stat-card" aria-label="マイノート">
        <h2>マイノート</h2>
        <div class="stat-body">
          <div class="ring"><svg viewBox="0 0 74 74"><circle cx="37" cy="37" r="${R}" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="7"/>
            <circle cx="37" cy="37" r="${R}" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-dasharray="${C * ratio} ${C}"/></svg>
            <span>${notes.length}</span></div>
          <div><b>${state.subjects.length}科目・${notes.length}ノート</b><small>うち ${reviewing}件を復習中</small></div>
        </div>
      </section>
    </div>
    <div class="section-head"><h2>最近のノート</h2><a class="link-btn" href="#/search">すべて見る</a></div>
    <div class="note-cards">
      ${recent.map((n) => `<a class="card note-card" href="#/note/${n.id}" style="${colorOf(n.subjectId)}">
        <span class="thumb"><i></i><i></i><i></i></span><b>${esc(n.title || '無題のノート')}</b><small>${esc(pathOf(n)[0])} · ${when(n)}</small></a>`).join('')}
      <button class="card note-card add" type="button" id="homeNew">${icon('pencil')}新しいノートを書く</button>
    </div>
  </div>`;
  $('#homeNew').addEventListener('click', () => addNote(sel.subjectId, sel.unitId, true));
  $('#homeSearch').addEventListener('submit', (e) => {
    e.preventDefault();
    go(`#/search?q=${encodeURIComponent(e.currentTarget.q.value.trim())}`);
  });
}

// =========================================================
// ノート編集
// =========================================================
let saveTimer = null;
let lastSavedAt = null;

function renderNote(r) {
  const note = r.id ? findNote(r.id) : null;
  const subject = findSubject(sel.subjectId);
  const unit = findUnit(subject, sel.unitId);
  const siblings = subject ? notesIn(subject.id, sel.unitId) : [];

  view.innerHTML = `<div class="note-layout">
    <aside class="note-list" aria-label="この単元のノート">
      <p class="nl-sub">${esc(subject?.name ?? '')}</p>
      <h2 class="nl-title">${esc(unit?.name ?? (subject ? '単元なし' : 'ノート'))}</h2>
      ${siblings.map((n) => `<a class="nl-item" href="#/note/${n.id}" data-note="${n.id}" draggable="true" ${n.id === note?.id ? 'aria-current="page"' : ''}>
        <b data-title-of="${n.id}">${esc(n.title || '無題のノート')}</b><small>${when(n)}${n.review ? ' · 復習中' : ''}</small></a>`).join('')}
      ${subject ? '<button class="nl-add" type="button" id="unitAdd">' + icon('plus') + 'この単元にノートを追加</button>' : ''}
    </aside>
    ${note ? editorHtml(note) : `<section class="editor"><div class="editor-empty">
      <p>${subject ? 'この単元にはまだノートがありません' : '左の「＋」から科目を追加しましょう'}</p>
      ${subject ? `<button class="btn btn-primary" type="button" id="emptyAdd">${icon('plus')}ノートを書く</button>` : ''}</div></section>`}
  </div>`;
  $('#unitAdd')?.addEventListener('click', () => addNote(sel.subjectId, sel.unitId, true));
  $('#emptyAdd')?.addEventListener('click', () => addNote(sel.subjectId, sel.unitId, true));
  if (note) bindEditor(note);
}

function editorHtml(note) {
  return `<section class="editor">
    <div class="editor-bar">
      <nav class="crumbs" aria-label="ノートの場所">${pathOf(note).map(esc).join('<span class="sep">›</span>')}</nav>
      <span class="chip chip-saved" id="saveChip" role="status"></span>
      <label class="switch"><input type="checkbox" id="reviewToggle" ${note.review ? 'checked' : ''}><span class="knob"></span>復習リスト</label>
      <a class="btn btn-primary" href="#/note/${note.id}/ai">${icon('sparkle')}AIに聞く</a>
      <button class="icon-btn" type="button" id="noteMore" aria-label="ノートのメニュー" aria-haspopup="menu">${icon('more')}</button>
    </div>
    <input class="title-input" id="titleInput" type="text" maxlength="100" placeholder="タイトル" aria-label="ノートのタイトル" value="${esc(note.title)}">
    <div class="panes">
      <div class="card pane">
        <label class="pane-label" for="mdInput">Markdown</label>
        <textarea class="md-input" id="mdInput" maxlength="${MAX_CHARS}" spellcheck="false"
          placeholder="## 見出し&#10;- 箇条書き&#10;- **用語**: 説明（太字の用語は確認問題に使われます）">${esc(note.body)}</textarea>
        <p class="pane-foot" id="charCount"></p>
      </div>
      <div class="card pane preview">
        <p class="pane-label">プレビュー</p>
        <div class="md" id="preview"></div>
      </div>
    </div>
  </section>`;
}

function bindEditor(note) {
  const md = $('#mdInput');
  const title = $('#titleInput');
  const chip = $('#saveChip');
  const showSaved = () => {
    const t = new Date(note.updatedAt || Date.now());
    chip.className = 'chip chip-saved';
    chip.innerHTML = `${icon('check')}自動保存済み · ${hhmm(t)} · 版 ${note.version || 1}`;
  };
  const count = () => {
    const c = $('#charCount');
    c.textContent = `${md.value.length.toLocaleString()} / ${MAX_CHARS.toLocaleString()} 文字`;
    c.classList.toggle('over', md.value.length >= MAX_CHARS);
  };
  const preview = () => { $('#preview').innerHTML = renderMarkdown(md.value); };
  const commit = () => {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (note.body === md.value && note.title === title.value.trim()) return;
    note.body = md.value;
    note.title = title.value.trim();
    delete note.html; // 以前のリッチテキストの見た目は使わない (本文は body が正)
    note.updated = today();
    note.updatedAt = new Date().toISOString();
    note.version = (note.version || 1) + 1;
    save();
    showSaved();
    const small = document.querySelector(`[data-note="${note.id}"] small`);
    if (small) small.textContent = `${when(note)}${note.review ? ' · 復習中' : ''}`;
  };
  const changed = () => {
    chip.className = 'chip chip-saving';
    chip.textContent = '保存中…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(commit, 700);
  };
  preview(); count(); showSaved();
  md.addEventListener('input', () => { preview(); count(); changed(); });
  title.addEventListener('input', () => {
    const b = document.querySelector(`[data-title-of="${note.id}"]`);
    if (b) b.textContent = title.value.trim() || '無題のノート';
    changed();
  });
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); md.focus(); } });
  // Tab で字下げ (箇条書きを入れ子にしやすくする)
  md.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.isComposing) return;
    e.preventDefault();
    document.execCommand('insertText', false, '  ');
  });
  $('#reviewToggle').addEventListener('change', (e) => {
    if (e.target.checked) note.review = { stage: 0, due: addDays(today(), 1), last: null };
    else delete note.review;
    save();
    renderSide();
    toast(e.target.checked ? '復習リストに入れました。明日の「今日の復習」に出ます' : '復習リストから外しました');
  });
  $('#noteMore').addEventListener('click', (e) => openMenu(e.currentTarget, [
    ['photo', '写真から用語を取り込む', () => openPhoto(note)],
    ['move', '別の単元へ移動', () => openMove(note.id)],
    null,
    ['trash', 'ゴミ箱へ移動', () => trashNote(note.id), 'danger'],
  ]));
  cleanup = commit;
  if (focusTitleOnce) { focusTitleOnce = false; title.focus(); }
  lastSavedAt = note.updatedAt;
}
let focusTitleOnce = false;
addEventListener('pagehide', () => cleanup?.());

// =========================================================
// AIに聞く (要約 / 確認問題 5〜15問)
// =========================================================
const summaryCache = new Map(); // ノートの id → { body, text }
const quizCache = new Map();    // ノートの id → { body, promise }
let aiTab = 'summary';
let aiRun = 0; // 画面を書きかえるたびに増やす (古い待ちが後から書きかえないため)

const aiErrorText = (e) => ai.ERROR_MESSAGES[e?.kind] || ai.ERROR_MESSAGES.unknown;
const AI_CONFIRM = {
  quiz: { title: 'AIで確認問題を作りますか？', text: 'ノートの内容から、確認問題を15問作ります。5・10・15問から選んで解けます。', ok: '作成する' },
  summary: { title: 'AIで要約しますか？', text: 'ノートの内容を3〜5行にまとめます。', ok: '要約する' },
  photo: { title: 'この写真から用語を読み取りますか？', text: '写真から用語と説明を読み取ります。1〜2分かかることがあります。', ok: '読み取る' },
};
function confirmAi(kind) {
  const c = AI_CONFIRM[kind];
  const d = $('#aiConfirm');
  $('#aiConfirmTitle').textContent = c.title;
  $('#aiConfirmText').textContent = c.text;
  $('#aiConfirmOk').textContent = c.ok;
  $('#aiConfirmNote').textContent = ai.isDemo
    ? 'デモ版のため、用意したサンプルの出力が表示されます。'
    : (kind === 'photo' ? '写真' : 'ノートの内容') + 'がAIに送られます。AIを使える回数には1日の上限があります。';
  return ask(d, $('#aiConfirmOk')).then((v) => v === 'ok');
}

function renderAi(r) {
  const note = findNote(r.id);
  view.innerHTML = `<div class="ai-layout">
    <section class="ai-main">
      <div class="crumbs"><a class="link-btn" href="#/note/${note.id}">${icon('back')}編集に戻る</a>
        <span>${pathOf(note).map(esc).join('<span class="sep"> › </span>')}</span></div>
      <h1 class="page-title">${esc(note.title || '無題のノート')}</h1>
      <article class="card read-card md">${renderMarkdown(note.body)}</article>
    </section>
    <aside class="ai-side" aria-label="AIに聞く">
      <div class="ai-side-head"><h2>${icon('sparkle')}AIに聞く</h2>${ai.isDemo ? '<span class="chip chip-demo">デモ出力です</span>' : ''}</div>
      <div class="seg" role="tablist">
        <button type="button" role="tab" data-tab="summary" aria-selected="${aiTab === 'summary'}">要約</button>
        <button type="button" role="tab" data-tab="quiz" aria-selected="${aiTab === 'quiz'}">確認問題</button>
      </div>
      <div class="ai-body" id="aiBody" aria-live="polite"></div>
      <p class="ai-foot">ノートを書き換えるまでは、同じ結果を再利用します</p>
    </aside>
  </div>`;
  view.querySelector('.seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    aiTab = b.dataset.tab;
    view.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', x === b));
    showAiTab(note);
  });
  showAiTab(note);
  cleanup = () => { aiRun++; };
}

function showAiTab(note) {
  const run = ++aiRun;
  const body = $('#aiBody');
  if (!note.body.trim()) { body.innerHTML = '<div class="ai-intro">ノートに内容を書くと、AI が要約や確認問題を作れます。</div>'; return; }
  if (aiTab === 'summary') showSummary(note, body, run);
  else showQuiz(note, body, run);
}

// --- 要約 ---
async function showSummary(note, body, run) {
  const cached = summaryCache.get(note.id);
  if (cached && cached.body === note.body) {
    body.innerHTML = `<div class="summary-out ai-output"></div>`;
    $('.summary-out', body).textContent = cached.text;
    return;
  }
  body.innerHTML = `<div class="ai-intro"><p>ノートの大事なところを、3〜5行の箇条書きにまとめます。</p>
    <button class="btn btn-primary btn-block" type="button" id="doSummary">${icon('sparkle')}要約を作る</button></div>`;
  $('#doSummary').addEventListener('click', async () => {
    if (!(await confirmAi('summary')) || run !== aiRun) return;
    const out = document.createElement('div');
    out.className = 'summary-out';
    body.replaceChildren(out);
    showThinking(out);
    const src = note.body;
    try {
      const r = await ai.generate({ feature: 'summary', input: src });
      if (run !== aiRun) return;
      await streamInto(out, ai.streamText(r.text), { isDemo: false });
      summaryCache.set(note.id, { body: src, text: r.text });
    } catch (e) {
      if (run === aiRun) body.innerHTML = `<p class="ai-error">${esc(aiErrorText(e))}</p>`;
    }
  });
}

// --- 確認問題 (自分の言葉で答えて、答え合わせ) ---
function validQuiz(questions) {
  if (!Array.isArray(questions)) return null;
  const ok = questions.filter((q) => q && q.text && q.answer).map((q) => ({ text: String(q.text), answer: String(q.answer) }));
  return ok.length ? ok : null;
}
// 15問の束を1回だけ作って保持し、5・10・15問はそこから選ぶ (ノートを書き換えたら作り直す)
const QUIZ_POOL = 15;
const QUIZ_COUNTS = [5, 10, 15];
let quizCount = 5;
const hasQuiz = (note) => { const c = quizCache.get(note.id); return !!(c && c.body === note.body); };
function quizFor(note) {
  if (hasQuiz(note)) return quizCache.get(note.id).promise;
  const promise = ai.generate({ feature: 'quiz', input: note.body, options: { count: QUIZ_POOL } }).then((r) => {
    const qs = validQuiz(r.data.questions);
    if (!qs) throw new ai.AiError('unknown');
    return qs;
  });
  quizCache.set(note.id, { body: note.body, promise });
  promise.catch(() => quizCache.delete(note.id));
  return promise;
}
// 問題数のボタン (5問 / 10問 / 15問) と「問題を作る」ボタン
function showQuiz(note, body, run) {
  const ready = hasQuiz(note);
  body.innerHTML = `<div class="ai-intro">
      <p>ノートの内容から確認問題を作ります。答えを自分の言葉で書いてから、答え合わせをしましょう。</p>
      <div class="count-pick" role="radiogroup" aria-label="問題数">
        ${QUIZ_COUNTS.map((n) => `<button type="button" role="radio" data-count="${n}" aria-checked="${n === quizCount}">${n}問</button>`).join('')}
      </div>
      <button class="btn btn-primary btn-lg btn-block" type="button" id="doQuiz">${icon('sparkle')}<span id="doQuizLabel"></span></button>
    </div>`;
  const label = () => { $('#doQuizLabel').textContent = `${quizCount}問の問題を${ready ? '解く' : '作る'}`; };
  label();
  $('.count-pick', body).addEventListener('click', (e) => {
    const b = e.target.closest('[data-count]');
    if (!b) return;
    quizCount = Number(b.dataset.count);
    body.querySelectorAll('[data-count]').forEach((x) => x.setAttribute('aria-checked', x === b));
    label();
  });
  $('#doQuiz').addEventListener('click', async () => {
    if (!ready && (!(await confirmAi('quiz')) || run !== aiRun)) return;
    startQuiz(note, body, run);
  });
}
async function startQuiz(note, body, run) {
  showThinking(body, '考え中… 確認問題を作っています');
  let pool;
  try { pool = await quizFor(note); } catch (e) {
    if (run === aiRun) body.innerHTML = `<p class="ai-error">${esc(aiErrorText(e))}</p>`;
    return;
  }
  if (run !== aiRun) return;
  const qs = shuffle(pool).slice(0, quizCount);
  let i = 0, score = 0;
  const step = () => {
    if (run !== aiRun) return;
    if (i >= qs.length) {
      body.innerHTML = `<div class="result"><p class="hint">おつかれさま！</p><p class="big num">${score} / ${qs.length}</p>
        <p>${score === qs.length ? '全問正解です。' : '「忘れていた」問題は、ノートを見直しておきましょう。'}</p>
        <button class="btn btn-primary" type="button" id="again">もう一度解く</button>
        <button class="link-btn" type="button" id="changeCount">問題数を変える</button></div>`;
      $('#again').addEventListener('click', () => startQuiz(note, body, run));
      $('#changeCount').addEventListener('click', () => showQuiz(note, body, run));
      return;
    }
    const q = qs[i];
    body.innerHTML = `<div class="q-progress"><b class="num">${i + 1} / ${qs.length}</b><div class="bar"><i style="width:${((i + 1) / qs.length) * 100}%"></i></div></div>
      <h3 class="q-title">${esc(q.text)}</h3>
      <label class="q-label" for="qAnswer">自分の言葉で答えてみよう</label>
      <textarea class="textarea" id="qAnswer" placeholder="ここに入力してください…"></textarea>
      <button class="btn btn-primary btn-lg btn-block" type="button" id="qCheck">答え合わせ</button>`;
    $('#qAnswer').focus();
    $('#qCheck').addEventListener('click', () => {
      const mine = $('#qAnswer').value.trim();
      const box = document.createElement('div');
      box.innerHTML = `<div class="answer-box"><b>答え</b><p>${esc(q.answer)}</p>${mine ? `<span class="mine">あなたの答え：${esc(mine)}</span>` : ''}</div>
        <p class="q-label" style="margin-top:14px">合っていましたか？</p>
        <div class="judge" style="margin-top:8px"><button class="btn" type="button" data-judge="0">ちがった</button><button class="btn btn-primary" type="button" data-judge="1">合っていた</button></div>`;
      $('#qCheck').replaceWith(box);
      $('#qAnswer').readOnly = true;
      box.querySelector('.judge').addEventListener('click', (e) => {
        const j = e.target.closest('[data-judge]');
        if (!j) return;
        score += Number(j.dataset.judge);
        i++;
        step();
      });
      box.querySelector('[data-judge="1"]').focus();
    });
  };
  step();
}

// =========================================================
// 今日の復習
// =========================================================
let reviewPick = null;
function renderReview() {
  const list = todayReviews();
  const done = list.filter(isDoneToday).length;
  const cur = list.find((n) => n.id === reviewPick && !isDoneToday(n)) || list.find((n) => !isDoneToday(n));
  reviewPick = cur?.id ?? null;

  let card;
  if (!list.length) {
    card = `<div class="card rv-done"><p class="big">今日の復習はありません</p>
      <p class="hint">ノートの「復習リスト」をオンにすると、1日後・3日後・7日後・14日後・30日後に復習が回ってきます。</p></div>`;
  } else if (!cur) {
    card = `<div class="card rv-done"><p class="big">今日の分はおわりました</p><p class="hint">おつかれさま！ 明日もまた一歩ずつ。</p>
      <a class="btn" href="#/home">ホームへ戻る</a></div>`;
  } else {
    const stage = Math.min(cur.review.stage || 0, INTERVALS.length - 1);
    const next = INTERVALS[Math.min(stage + 1, INTERVALS.length - 1)];
    const [subj, unit] = pathOf(cur);
    const text = plain(cur.body);
    card = `<article class="card rv-card" style="${colorOf(cur.subjectId)}">
        <div class="chips"><span class="chip">${esc(subj)}</span>${unit ? esc(unit) : ''}</div>
        <h2>${esc(cur.title || '無題のノート')}</h2>
        <p class="excerpt">${esc(text.length > 150 ? text.slice(0, 150) + '…' : text) || '（本文なし）'}</p>
        <a class="link-btn" href="#/note/${cur.id}">ノート全体を開く ${icon('chev')}</a>
        <div class="interval"><p class="hint">復習の間隔</p>
          <div class="steps">${INTERVALS.map((d, k) => `<span class="${k <= stage ? 'on' : ''} ${k === stage ? 'now' : ''}">${d}日</span>`).join('')}</div></div>
      </article>
      <div class="rv-actions">
        <button class="btn btn-lg" type="button" data-answer="forgot">忘れていた<small>明日もう一度</small></button>
        <button class="btn btn-primary btn-lg" type="button" data-answer="ok">覚えていた<small>次は${next}日後</small></button>
      </div>`;
  }

  view.innerHTML = `<div class="deco"></div><div class="page">
    <div class="review-head">
      <div><h1 class="page-title">今日の復習</h1><p class="page-sub">${jpDate()} · 復習日が今日までのノートを科目順に表示</p></div>
      ${list.length ? `<div class="review-progress"><div class="bar"><i style="width:${(done / list.length) * 100}%"></i></div><b class="num">${done}/${list.length}</b></div>` : ''}
    </div>
    <div class="review-grid">
      <div class="rv-list">${list.map((n) => `<button class="rv-item${isDoneToday(n) ? ' is-done' : ''}" type="button" data-pick="${n.id}" style="${colorOf(n.subjectId)}" ${n.id === cur?.id ? 'aria-current="true"' : ''}>
        <i class="dot"></i><span><b>${esc(n.title || '無題のノート')}</b><small>${esc(pathOf(n)[0])}</small></span>
        ${n.id === cur?.id ? '<em>いま</em>' : isDoneToday(n) ? `<em>${icon('check')}</em>` : ''}</button>`).join('')}</div>
      <div>${card}</div>
    </div>
  </div>`;

  view.querySelector('.rv-list')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pick]');
    if (!b || isDoneToday(findNote(b.dataset.pick))) return;
    reviewPick = b.dataset.pick;
    renderReview();
  });
  view.querySelector('.rv-actions')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-answer]');
    if (!b) return;
    const rv = cur.review;
    if (b.dataset.answer === 'ok') {
      rv.stage = Math.min((rv.stage || 0) + 1, INTERVALS.length - 1);
      rv.due = addDays(today(), INTERVALS[rv.stage]);
    } else {
      rv.stage = 0;
      rv.due = addDays(today(), 1);
    }
    rv.last = today();
    save();
    reviewPick = null;
    renderSide();
    renderReview();
  });
}

// =========================================================
// 検索
// =========================================================
function renderSearch(r) {
  view.innerHTML = `<div class="search-page">
    <h1 class="page-title">ノートを探す</h1>
    <form class="searchbox searchbox-lg" id="searchForm" role="search">${icon('search')}
      <input type="search" name="q" value="${esc(r.q)}" placeholder="キーワードを入力" aria-label="キーワード"><span class="hint">Enter で検索</span></form>
    <p class="search-meta" id="searchMeta"></p>
    <div class="results" id="results"></div>
  </div>`;
  const input = $('#searchForm').q;
  $('#searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    history.replaceState(null, '', `#/search?q=${encodeURIComponent(input.value.trim())}`);
    showResults(input.value.trim());
  });
  showResults(r.q);
  if (!r.q) input.focus();
}
function hl(text, q) {
  if (!q) return esc(text);
  const lower = text.toLowerCase(), k = q.toLowerCase();
  let out = '', from = 0, i;
  while ((i = lower.indexOf(k, from)) >= 0) { out += esc(text.slice(from, i)) + `<mark>${esc(text.slice(i, i + k.length))}</mark>`; from = i + k.length; }
  return out + esc(text.slice(from));
}
function snippet(text, q) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text.slice(0, 60) + (text.length > 60 ? '…' : '');
  const s = Math.max(0, i - 24), e = Math.min(text.length, i + q.length + 36);
  return (s > 0 ? '…' : '') + text.slice(s, e) + (e < text.length ? '…' : '');
}
function showResults(q) {
  const meta = $('#searchMeta');
  const box = $('#results');
  const k = q.toLowerCase();
  const hits = live().filter((n) => !k || [n.title, n.body, ...pathOf(n)].some((t) => (t || '').toLowerCase().includes(k))).sort(byNewest);
  const shown = hits.slice(0, SEARCH_LIMIT);
  meta.textContent = q
    ? `${hits.length}件 · 更新日の新しい順 · 自分のノートだけが対象（最大${SEARCH_LIMIT}件）`
    : `すべてのノート ${hits.length}件 · 更新日の新しい順`;
  box.innerHTML = shown.length ? shown.map((n) => `<a class="card result-item" href="#/note/${n.id}">
      <span class="crumbs">${pathOf(n).map((p) => hl(p, q)).join('<span class="sep">›</span>')}</span>
      <b>${hl(n.title || '無題のノート', q)}</b>
      <p>${hl(snippet(plain(n.body), q), q)}</p>
      <time>${when(n)}</time></a>`).join('')
    : '<p class="empty-line">見つかりませんでした。別のことばで探してみてください。</p>';
}

// =========================================================
// ゴミ箱
// =========================================================
function renderTrash() {
  const items = state.notes.filter((n) => n.trashed).sort((a, b) => b.trashed.localeCompare(a.trashed));
  view.innerHTML = `<div class="page">
    <h1 class="page-title">ゴミ箱</h1>
    <p class="page-sub">消したノートはここに残ります。元に戻すか、完全に削除できます。</p>
    <div class="trash-list">${items.map((n) => `<div class="card trash-item">
      <div><b>${esc(n.title || '無題のノート')}</b><small>${esc(pathOf(n).join(' › '))} · ${new Date(n.trashed).toLocaleDateString('ja-JP')} に削除</small></div>
      <button class="btn" type="button" data-restore="${n.id}">元に戻す</button>
      <button class="btn" type="button" data-purge="${n.id}">完全に削除</button></div>`).join('')
      || '<p class="empty-line">ゴミ箱は空です。</p>'}</div>
  </div>`;
  view.querySelector('.trash-list').addEventListener('click', (e) => {
    const r = e.target.closest('[data-restore]');
    if (r) {
      const n = findNote(r.dataset.restore);
      if (!findSubject(n.subjectId)) {
        if (!state.subjects.length) state.subjects.push({ id: uid('s'), name: '未分類', open: true, units: [] });
        n.subjectId = state.subjects[0].id; n.unitId = null;
      } else if (n.unitId && !findUnit(findSubject(n.subjectId), n.unitId)) n.unitId = null;
      delete n.trashed;
      save(); renderSide(); renderTrash();
      toast('ノートを元に戻しました');
      return;
    }
    const p = e.target.closest('[data-purge]');
    if (p) {
      const n = findNote(p.dataset.purge);
      confirmAction('完全に削除', `「${n.title || '無題のノート'}」を完全に削除します。元に戻せません。`, '完全に削除する', () => {
        state.notes = state.notes.filter((x) => x.id !== n.id);
        save(); renderTrash();
      });
    }
  });
}

// =========================================================
// 科目・単元・ノートの操作
// =========================================================
// ダイアログを開き、押されたボタンの value を返す (×・Esc は '')
function ask(dialog, focusEl) {
  dialog.returnValue = '';
  dialog.showModal();
  focusEl?.focus();
  return new Promise((resolve) => {
    const watch = new AbortController();
    const done = (v) => { watch.abort(); resolve(v); };
    dialog.querySelector('form').addEventListener('submit', (e) => done(e.submitter?.value || ''), { signal: watch.signal });
    dialog.addEventListener('close', () => done(dialog.returnValue || ''), { signal: watch.signal });
  });
}
// 「キャンセル」「×」はどのダイアログでも閉じるだけ
document.addEventListener('click', (e) => { const b = e.target.closest('dialog [data-close]'); if (b) b.closest('dialog').close(''); });
async function askName({ title, label, value = '', ok }) {
  const d = $('#nameDialog');
  $('#nameTitle').textContent = title;
  $('#nameLabel').textContent = label;
  $('#nameOk').textContent = ok;
  const input = $('#nameInput');
  input.value = value;
  const wait = ask(d, input);
  input.select();
  const v = await wait;
  return v === 'ok' ? input.value.trim() : null;
}
async function confirmAction(title, body, okLabel, done) {
  $('#confirmTitle').textContent = title;
  $('#confirmBody').textContent = body;
  const okBtn = $('#confirmOk');
  okBtn.textContent = okLabel;
  okBtn.className = 'btn btn-danger';
  if (await ask($('#confirmDialog'), okBtn) === 'ok') done();
}

async function addSubject() {
  const name = await askName({ title: '科目を追加', label: '科目の名前', ok: '追加する' });
  if (!name) return;
  const s = { id: uid('s'), name, open: true, units: [] };
  state.subjects.push(s);
  save();
  sel.subjectId = s.id; sel.unitId = null;
  addUnit(s.id);
}
async function addUnit(sid) {
  const s = findSubject(sid);
  const name = await askName({ title: `「${s.name}」に単元を追加`, label: '単元の名前（例：第1回 ER 図）', ok: '追加する' });
  if (!name) { renderSide(); return; }
  const u = { id: uid('u'), name };
  s.units.push(u);
  s.open = true;
  save();
  go(`#/unit/${s.id}/${u.id}`);
}
async function renameSubject(sid) {
  const s = findSubject(sid);
  const name = await askName({ title: '科目の名前を変更', label: '科目の名前', value: s.name, ok: '変更する' });
  if (!name) return;
  s.name = name; save(); render();
}
async function renameUnit(sid, id) {
  const u = findUnit(findSubject(sid), id);
  const name = await askName({ title: '単元の名前を変更', label: '単元の名前', value: u.name, ok: '変更する' });
  if (!name) return;
  u.name = name; save(); render();
}
function deleteSubject(sid) {
  const s = findSubject(sid);
  const count = live().filter((n) => n.subjectId === sid).length;
  confirmAction('科目を削除', `「${s.name}」を削除します。${count ? `中のノート${count}件はゴミ箱へ移ります。` : ''}`, '削除する', () => {
    const now = new Date().toISOString();
    for (const n of live()) if (n.subjectId === sid) n.trashed = now;
    state.subjects = state.subjects.filter((x) => x.id !== sid);
    if (sel.subjectId === sid) { sel.subjectId = state.subjects[0]?.id ?? null; sel.unitId = null; }
    save();
    go('#/home');
  });
}
function deleteUnit(sid, id) {
  const s = findSubject(sid);
  const u = findUnit(s, id);
  confirmAction('単元を削除', `「${u.name}」を削除します。中のノートは消さずに「単元なし」へ移します。`, '削除する', () => {
    for (const n of state.notes) if (n.subjectId === sid && n.unitId === id) n.unitId = null;
    s.units = s.units.filter((x) => x.id !== id);
    if (sel.unitId === id) sel.unitId = null;
    save();
    render();
  });
}
function addNote(subjectId, unitId, focus) {
  let sid = findSubject(subjectId) ? subjectId : state.subjects[0]?.id;
  if (!sid) {
    const s = { id: uid('s'), name: 'はじめての科目', open: true, units: [] };
    state.subjects.push(s);
    sid = s.id;
  }
  const s = findSubject(sid);
  const uidOk = unitId && findUnit(s, unitId) ? unitId : null;
  const n = { id: uid('n'), subjectId: sid, unitId: uidOk, title: '', body: '', updated: today(), updatedAt: new Date().toISOString(), version: 1 };
  state.notes.push(n);
  s.open = true;
  save();
  focusTitleOnce = !!focus;
  go(`#/note/${n.id}`);
}
function trashNote(id) {
  const n = findNote(id);
  cleanup?.(); cleanup = null;
  n.trashed = new Date().toISOString();
  save();
  toast('ゴミ箱へ移動しました');
  const next = notesIn(n.subjectId, n.unitId)[0];
  go(next ? `#/note/${next.id}` : `#/unit/${n.subjectId}/${n.unitId ?? '_'}`);
}
function moveNoteTo(id, subjectId, unitId) {
  const n = findNote(id);
  if (!n || (n.subjectId === subjectId && (n.unitId || null) === (unitId || null))) return;
  cleanup?.(); cleanup = null;
  n.subjectId = subjectId;
  n.unitId = unitId || null;
  findSubject(subjectId).open = true;
  save();
  toast(`「${pathOf(n).join(' › ')}」へ移動しました`);
  go(`#/note/${n.id}`);
}
async function openMove(id) {
  const n = findNote(id);
  const select = $('#moveSelect');
  select.innerHTML = state.subjects.map((s) => `<optgroup label="${esc(s.name)}">
    <option value="${s.id}|">${esc(s.name)}（単元なし）</option>
    ${s.units.map((u) => `<option value="${s.id}|${u.id}">${esc(u.name)}</option>`).join('')}</optgroup>`).join('');
  select.value = `${n.subjectId}|${n.unitId ?? ''}`;
  $('#moveNoteName').textContent = `「${n.title || '無題のノート'}」の移動先を選んでください`;
  if (await ask($('#moveDialog'), select) !== 'ok') return;
  const [sid, uId] = select.value.split('|');
  moveNoteTo(id, sid, uId || null);
}

// =========================================================
// 「…」メニュー
// =========================================================
const menu = $('#menu');
let menuOwner = null;
function openMenu(btn, items) {
  if (menuOwner === btn) { closeMenu(true); return; }
  closeMenu();
  menu.innerHTML = '';
  const actions = [];
  for (const it of items) {
    if (!it) { menu.append(document.createElement('hr')); continue; }
    const [ic, label, act, cls] = it;
    if (!act) { const p = document.createElement('p'); p.className = 'menu-text'; p.textContent = label; menu.append(p); continue; }
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    if (cls) b.className = cls;
    b.innerHTML = `${ic ? icon(ic) : ''}<span>${esc(label)}</span>`;
    b.addEventListener('click', () => { closeMenu(); act(); });
    menu.append(b);
    actions.push(b);
  }
  menu.hidden = false;
  const r = btn.getBoundingClientRect();
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = `${Math.max(8, Math.min(r.right - w, innerWidth - w - 8))}px`;
  menu.style.top = `${r.bottom + h + 6 > innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6}px`;
  btn.setAttribute('aria-expanded', 'true');
  menuOwner = btn;
  actions[0]?.focus();
}
function closeMenu(refocus) {
  if (menu.hidden) return;
  menu.hidden = true;
  menuOwner?.setAttribute('aria-expanded', 'false');
  if (refocus) menuOwner?.focus();
  menuOwner = null;
}
document.addEventListener('click', (e) => { if (!menu.hidden && !e.target.closest('#menu') && !menuOwner?.contains(e.target)) closeMenu(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !menu.hidden) closeMenu(true);
  if (!menu.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    const items = [...menu.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    e.preventDefault();
  }
});

// =========================================================
// 写真から取り込み
// =========================================================
let photoNote = null;
let extracted = [];
function openPhoto(note) {
  photoNote = note;
  $('#photoInput').value = '';
  $('#photoPreview').hidden = true;
  $('#dropText').hidden = false;
  $('#dropText').textContent = '手書きノートの写真を撮る / 選ぶ';
  $('#photoResult').hidden = true;
  $('#photoAdd').disabled = true;
  ask($('#photoDialog'));
}
const PHOTO_MAX_CHARS = 2_900_000;
async function shrinkPhoto(file, max = 2560) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  const g = canvas.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  for (const q of [0.92, 0.85, 0.75, 0.65]) {
    const data = canvas.toDataURL('image/jpeg', q).split(',')[1];
    if (data.length <= PHOTO_MAX_CHARS) return data;
  }
  return shrinkPhoto(file, Math.round(max * 0.75));
}
const PHOTO_ERRORS = {
  timeout: '読み取りに時間がかかりすぎました。もう一度選ぶか、写真を明るく撮り直してください',
  unavailable: 'AIが混み合っています。少し時間をおいてから、もう一度選んでください',
  too_large: '写真が大きすぎます。別の写真を選んでください',
  bad_image: 'この写真の形式は読めません。JPEG / PNG の写真を選んでください',
  no_key: 'AIの設定 (APIキー) がありません',
};
$('#photoInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = $('#photoPreview');
  const text = $('#dropText');
  img.src = URL.createObjectURL(file);
  img.hidden = false;
  $('#photoResult').hidden = true;
  $('#photoAdd').disabled = true;
  text.hidden = false;
  text.textContent = '写真を確認してください';
  const photoDialog = $('#photoDialog');
  photoDialog.close();
  const yes = await confirmAi('photo');
  photoDialog.showModal();
  if (!yes) { e.target.value = ''; img.hidden = true; text.textContent = '手書きノートの写真を撮る / 選ぶ'; return; }
  const t0 = Date.now();
  const tick = () => { text.textContent = `考え中… 用語を読み取っています ${Math.round((Date.now() - t0) / 1000)}秒`; };
  tick();
  const timer = setInterval(tick, 1000);
  let r = null, failure = null;
  try {
    let image;
    try { image = await shrinkPhoto(file); } catch { throw new ai.AiError('unknown', 'bad_image'); }
    r = await ai.generate({ feature: 'photo', input: { image, mime: 'image/jpeg' } });
  } catch (err) { failure = err; } finally { clearInterval(timer); }
  if (e.target.files[0] !== file) return;
  if (failure) { text.textContent = PHOTO_ERRORS[failure.code] || aiErrorText(failure); return; }
  if (r.data.message) { text.textContent = r.data.message; return; }
  extracted = (Array.isArray(r.data.words) ? r.data.words : []).filter((w) => w?.term && w?.desc).map((w) => ({ term: String(w.term), desc: String(w.desc) }));
  if (!extracted.length) { text.textContent = '用語が見つかりませんでした。明るい場所で、ノートが画面いっぱいになるように撮り直してください'; return; }
  text.hidden = true;
  $('#wordList').innerHTML = extracted.map((w, i) => `<li><label><input type="checkbox" value="${i}" checked>
    <span><strong>${esc(w.term)}</strong> <small>${esc(w.desc)}</small></span></label></li>`).join('');
  $('#photoResult').hidden = false;
  $('#photoAdd').disabled = false;
});
$('#photoAdd').addEventListener('click', () => {
  const picked = [...document.querySelectorAll('#wordList input:checked')].map((c) => extracted[Number(c.value)]);
  const note = photoNote;
  $('#photoDialog').close();
  if (!note || !picked.length) return;
  cleanup?.(); cleanup = null;
  note.body = `${note.body.replace(/\s+$/, '')}\n\n## 写真から取り込み\n${picked.map((w) => `- **${w.term}**: ${w.desc}`).join('\n')}\n`.replace(/^\n+/, '');
  note.updated = today();
  note.updatedAt = new Date().toISOString();
  note.version = (note.version || 1) + 1;
  save();
  render();
  toast(`${picked.length}件の用語を追加しました`);
});

// =========================================================
// 同時編集の競合 (別の端末が先に保存していた)
// =========================================================
function diffLines(a, b) {
  // b にしか無い行を「追加」、a にしか無い行を「削除」として色を付ける (簡易)
  const as = new Set(a.split('\n')), bs = new Set(b.split('\n'));
  const out = b.split('\n').map((l) => (as.has(l) ? esc(l) : `<span class="add">${esc(l)}</span>`));
  for (const l of a.split('\n')) if (l.trim() && !bs.has(l)) out.push(`<span class="del">${esc(l)}</span>`);
  return out.join('\n');
}
addEventListener('cloud-conflict', async (e) => {
  const { remote, at } = e.detail;
  cleanup?.(); // 編集中の内容をいったん確定してから比べる
  const r = parseRoute();
  const mineNote = r.id ? findNote(r.id) : null;
  const theirsNote = mineNote ? remote.notes?.find((n) => n.id === mineNote.id) : null;
  const mine = mineNote ? `${mineNote.title}\n${mineNote.body}` : `${state.notes.length}件のノート`;
  const theirs = theirsNote ? `${theirsNote.title}\n${theirsNote.body}` : `${remote.notes?.length ?? 0}件のノート`;
  $('#mineHead').textContent = 'この端末 · 編集中';
  $('#theirsHead').textContent = `ほかの端末 · ${hhmm(new Date(at))} に保存`;
  $('#mineBody').innerHTML = diffLines(theirs, mine);
  $('#theirsBody').innerHTML = diffLines(mine, theirs);
  const d = $('#conflictDialog');
  d.addEventListener('cancel', (ev) => ev.preventDefault(), { once: true }); // どちらかを選んでもらう
  const choice = await ask(d);
  const now = new Date().toISOString();
  if (choice === 'theirs') {
    const keep = mineNote && theirsNote && mine !== theirs ? { ...structuredClone(mineNote), id: uid('n'), title: `${mineNote.title}（この端末の版）`, trashed: now } : null;
    state.subjects = remote.subjects;
    state.notes = remote.notes;
    state.name = remote.name || '';
    if (keep) state.notes.push(keep);
  } else if (theirsNote && mine !== theirs) {
    state.notes.push({ ...structuredClone(theirsNote), id: uid('n'), title: `${theirsNote.title}（ほかの端末の版）`, trashed: now });
  }
  cloud.resolveConflict(at);
  save();
  render();
  toast(choice === 'theirs' ? 'ほかの端末の内容にしました' : '自分の内容で保存しました');
});
addEventListener('cloud-save-error', () => {
  const chip = $('#saveChip');
  if (chip) { chip.className = 'chip chip-error'; chip.textContent = 'クラウドに保存できませんでした（この端末には保存済み）'; }
});

// ---------- お知らせ ----------
let toastTimer = null;
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2600);
}

renderAccount();
render();
