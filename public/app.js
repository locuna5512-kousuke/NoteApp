// AIといっしょ — 画面の処理。
// AI の部分 (テスト作成 / 説明チェック / 要約 / 写真から用語) は ai/index.js だけを通して呼ぶ。
// 本物の AI かデモ (サンプル出力) かは ai/index.js が設定を見て決めるので、ここでは区別しない。
// 出力の見せ方 (考え中 → タイピング表示 → デモ表記) は components/AiOutput.js に任せる。
//
// ノートは「科目 › 単元 › ノート」の3段で整理する。
// 単元は必須ではなく、科目の直下にノートを置くこともできる (note.unitId = null)。
//
// 本文はリッチテキスト (ツールボックスで見出し・文字の大きさ・色を付けられる)。
// 見た目は note.html に保存し、同じ内容を Markdown 風の文字にしたものを note.body に持つ。
// 説明チェック・ホーム画面は note.body の「- **用語**: 説明」の行を読む。

import * as ai from './ai/index.js';
import { showThinking, streamInto, addDemoBadge } from './components/AiOutput.js';
import { demoBadge } from './components/DemoBadge.js';
import * as cloud from './cloud.js';

const STORAGE_KEY = 'noteapp.v2';
const OLD_STORAGE_KEY = 'noteapp.v1'; // 科目が「フォルダ名の文字列」だったころのデータ

// ログイン中なら、Supabase に保存してあるノートを localStorage に写してから画面を作る
// ('guest' = 未ログイン / 'synced' = 読み込めた / 'offline' = 読めなかった)
const cloudStatus = await cloud.start(STORAGE_KEY);

const SAMPLE_SUBJECTS = [
  { id: 's1', name: '基本情報技術者', open: true, units: [
    { id: 'u1', name: 'ネットワーク', open: true },
    { id: 'u2', name: 'データベース', open: false },
  ] },
  { id: 's2', name: '簿記2級', open: false, units: [
    { id: 'u3', name: '仕訳', open: true },
  ] },
  { id: 's3', name: 'TOEIC', open: false, units: [] },
];

const SAMPLE_NOTES = [
  {
    id: 'n1', subjectId: 's1', unitId: 'u1', title: 'ネットワークの基礎', updated: '2026-11-12',
    body: `# ネットワークの基礎

## プロトコル
- **TCP**: 通信相手との接続を確立し、データの到達と順序を保証するプロトコル
- **UDP**: 接続を確立せずに送信する、速度を優先した軽量なプロトコル
- **HTTP**: ブラウザとサーバの間でWebページをやり取りするプロトコル
- **DNS**: ドメイン名をIPアドレスに変換する仕組み

## アドレス
- **IPアドレス**: ネットワーク上の機器を識別する番号
- **MACアドレス**: 機器に製造時から割り当てられている固有の番号
- **サブネットマスク**: IPアドレスのネットワーク部とホスト部を区切る値
- **DHCP**: 機器にIPアドレスを自動で割り当てる仕組み

> 動画配信や通話は多少欠けても速いほうがいい → UDP`,
  },
  {
    id: 'n5', subjectId: 's1', unitId: 'u1', title: 'OSI参照モデル', updated: '2026-11-15',
    body: `# OSI参照モデル

- **物理層**: ビット列を電気信号や光に変えて送る層
- **データリンク層**: 隣り合う機器同士の通信を担う層
- **ネットワーク層**: 宛先までの経路を選ぶ層
- **トランスポート層**: 通信の信頼性を確保する層`,
  },
  {
    id: 'n2', subjectId: 's1', unitId: 'u2', title: 'データベース', updated: '2026-11-10',
    body: `# データベース

## 設計
- **主キー**: 表の中で行を一意に識別する列
- **外部キー**: 他の表の主キーを参照して表同士を関連づける列
- **正規化**: データの重複をなくすために表を分割する設計手法
- **インデックス**: 検索を速くするために列に作成する索引

## 操作
- **SQL**: データベースを操作するための言語
- **トランザクション**: 複数の処理をひとまとまりとして扱う単位

\`SELECT name FROM students WHERE grade = 2;\``,
  },
  {
    id: 'n3', subjectId: 's2', unitId: 'u3', title: '仕訳の基本', updated: '2026-11-08',
    body: `# 仕訳の基本

- **借方**: 仕訳の左側。資産の増加や費用の発生を記入する
- **貸方**: 仕訳の右側。負債の増加や収益の発生を記入する
- **資産**: 現金や建物など、会社が持っている財産
- **負債**: 借入金など、将来支払う義務
- **純資産**: 資産から負債を差し引いた残り
- **減価償却**: 固定資産の取得原価を使用期間にわたって費用に配分する手続き`,
  },
  {
    id: 'n4', subjectId: 's3', unitId: null, title: 'Part5 頻出単語', updated: '2026-11-05',
    body: `# Part5 頻出単語

- **allocate**: 予算や時間を割り当てる
- **comply**: 規則や要求に従う
- **reimburse**: 立て替えた費用を払い戻す
- **postpone**: 予定を延期する
- **eligible**: 資格がある、対象となる`,
  },
];

// ---------- 状態 ----------
// ID を作る (頭の文字 + 時刻 + 乱数)
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// localStorage から読み込む。新形式がなければ旧形式を変換し、どちらもなければ null
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
    if (!byName[name]) {
      byName[name] = { id: uid('s'), name, open: true, units: [] };
      subjects.push(byName[name]);
    }
    n.subjectId = byName[name].id;
    n.unitId = null;
    delete n.folder;
  }
  return { subjects, notes: old.notes, name: old.name || '' };
}

// 科目・ノート・名前を localStorage に保存する。ログイン中は Supabase にも送る
function save() {
  const data = { subjects: state.subjects, notes: state.notes, name: state.name };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* 保存できなくても動かす */ }
  cloud.push(data);
}

// 保存データがなければサンプルで始める (structuredClone でサンプル自体は書きかえない)
const state = load() || { subjects: structuredClone(SAMPLE_SUBJECTS), notes: structuredClone(SAMPLE_NOTES), name: '' };
// 初めてログインしたときは、この端末のノート (無ければサンプル) を Supabase に入れておく
if (cloud.firstTime) save();
state.noteId = null;
state.query = '';
// 「新しいノート」を作る場所 (いま見ている科目・単元)
state.sel = { subjectId: state.subjects[0]?.id ?? null, unitId: null };

{
  // ホームから index.html#n1 のように来たら、そのノートを開く
  const fromHash = location.hash.slice(1);
  const first = state.notes.find((n) => n.id === fromHash) || state.notes.find((n) => n.subjectId === state.sel.subjectId) || state.notes[0];
  if (first) {
    state.noteId = first.id;
    state.sel = { subjectId: first.subjectId, unitId: first.unitId };
  }
}

// よく使う小さな関数 (要素の取得・HTML のエスケープ・今日の日付・ノートや科目の検索)
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const currentNote = () => state.notes.find((n) => n.id === state.noteId);
const findSubject = (id) => state.subjects.find((s) => s.id === id);
const findUnit = (s, id) => (s ? s.units.find((u) => u.id === id) : undefined);
const notesIn = (sid, unitId) => state.notes.filter((n) => n.subjectId === sid && (n.unitId || null) === (unitId || null));
// ノートの場所を [科目名, 単元名] で返す
const pathOf = (note) => {
  const s = findSubject(note.subjectId);
  const u = findUnit(s, note.unitId);
  return [s?.name ?? '未分類', u?.name].filter(Boolean);
};
// '2026-11-12' → '11/12'
const shortDate = (d) => d.slice(5).replace('-', '/');
// SVG スプライトのアイコンを使う
const icon = (id, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
// 配列を混ぜた新しい配列を返す (元の配列は変えない)
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ---------- パネル見出しの日付 ----------
{
  const d = new Date();
  $('#todayText').textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 (${'日月火水木金土'[d.getDay()]})`;
}

// ---------- Markdown ----------
// 行の中の `コード` と **太字** を HTML にする
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

// Markdown 風の文字を HTML にする (見出し・箇条書き・引用・コードだけの簡易版)
function renderMarkdown(src) {
  const out = [];
  let list = null; // 'ul' | 'ol'
  let para = [];
  let code = null;
  const flushPara = () => { if (para.length) { out.push(`<p>${para.join('<br>')}</p>`); para = []; } };
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };

  for (const line of src.split('\n')) {
    // コードブロックの中は ``` が来るまでそのまま貯める
    if (code) {
      if (line.startsWith('```')) { out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`); code = null; }
      else code.push(line);
      continue;
    }
    let m;
    if (line.startsWith('```')) { flushPara(); closeList(); code = []; }
    else if ((m = line.match(/^(#{1,3})\s+(.*)$/))) { flushPara(); closeList(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
    else if ((m = line.match(/^\s*(?:[-*]|(\d+)\.)\s+(.*)$/))) {
      flushPara();
      const type = m[1] ? 'ol' : 'ul';
      if (list !== type) { closeList(); out.push(`<${type}>`); list = type; }
      out.push(`<li>${inline(m[2])}</li>`);
    }
    else if ((m = line.match(/^>\s?(.*)$/))) { flushPara(); closeList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
    else if (!line.trim()) { flushPara(); closeList(); }
    else { closeList(); para.push(inline(line)); }
  }
  if (code) out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
  flushPara(); closeList();
  return out.join('\n');
}

// 「- **用語**: 説明」の行を用語として拾う
function parseTerms(body) {
  const terms = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*[-*]\s+(?:\[[ x]\]\s+)?\*\*(.+?)\*\*\s*[:：]\s*(.+)$/);
    if (m) terms.push({ term: m[1].trim(), desc: m[2].trim() });
  }
  return terms;
}

// 本文の中の検索語を <mark> で囲み、見つかった数を返す
function highlight(root, query) {
  if (!query) return 0;
  const q = query.toLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  let count = 0;
  for (const node of nodes) {
    const text = node.nodeValue;
    const lower = text.toLowerCase();
    let from = 0, idx = lower.indexOf(q);
    if (idx < 0) continue;
    const frag = document.createDocumentFragment();
    while (idx >= 0) {
      frag.append(text.slice(from, idx));
      const mark = document.createElement('mark');
      mark.dataset.hl = ''; // 検索のハイライト。保存するときは外す
      mark.textContent = text.slice(idx, idx + q.length);
      frag.append(mark);
      count++;
      from = idx + q.length;
      idx = lower.indexOf(q, from);
    }
    frag.append(text.slice(from));
    node.replaceWith(frag);
  }
  return count;
}

// ---------- AI ----------
// 失敗 (AiError) を画面に出す文にする
const aiErrorText = (e) => ai.ERROR_MESSAGES[e?.kind] || ai.ERROR_MESSAGES.unknown;

// AI を使う前の確認画面の文 (機能ごと)
const AI_CONFIRM = {
  quiz: { title: 'AIで問題を作成しますか？', text: 'ノートの内容から、4択問題を15問作ります。', ok: '作成する' },
  check: { title: 'AIで説明をチェックしますか？', text: '書いた説明をノートの説明と比べて、点数とアドバイスを出します。', ok: 'チェックする' },
  summary: { title: 'AIで要点をまとめますか？', text: 'ノートの内容を3〜5行にまとめます。', ok: 'まとめる' },
  photo: { title: 'この写真から用語を読み取りますか？', text: '写真から用語と説明を読み取ります。1〜2分かかることがあります。', ok: '読み取る' },
};

// AI を使う前に確認画面を出す。「OK」なら true、キャンセル・×・Esc なら false
function confirmAi(kind) {
  const c = AI_CONFIRM[kind];
  const d = $('#aiConfirm');
  $('#aiConfirmTitle').textContent = c.title;
  $('#aiConfirmText').textContent = c.text;
  $('#aiConfirmOk').textContent = c.ok;
  $('#aiConfirmNote').textContent = ai.isDemo
    ? 'デモ版のため、用意したサンプルの出力が表示されます。'
    : (kind === 'photo' ? '写真' : 'ノートの内容') + 'がAIに送られます。AIを使える回数には1日の上限があります。';
  d.returnValue = '';
  d.showModal();
  $('#aiConfirmOk').focus();
  return new Promise((resolve) => {
    // ボタンを押した時点で決める (close イベントは、ブラウザによって届くのが遅れることがあるため)。
    // Esc などで閉じたときは close で決める。決まったら、ここで付けた見張りはすべて外す
    const watch = new AbortController();
    const done = (yes) => { watch.abort(); resolve(yes); };
    d.querySelector('form').addEventListener('submit', (e) => done(e.submitter?.value === 'ok'), { signal: watch.signal });
    d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => done(false), { signal: watch.signal }));
    d.addEventListener('close', () => done(d.returnValue === 'ok'), { signal: watch.signal });
  });
}

// AI のテストを画面で使える形にそろえる。使えなければ null
function validQuiz(questions) {
  if (!Array.isArray(questions)) return null;
  const ok = questions
    .filter((q) => q && q.text && Array.isArray(q.choices) && q.choices.length === 4 && q.choices.includes(q.answer))
    .map((q) => ({ text: String(q.text), answer: q.answer, choices: shuffle(q.choices.map(String)) }));
  return ok.length ? ok : null;
}

// =========================================================
// 左: 科目 › 単元 › ノート のツリー
// =========================================================
// ツリーのノート1行分の HTML
function noteRow(n) {
  const cur = n.id === state.noteId;
  return `
    <li role="treeitem" aria-selected="${cur}">
      <div class="row note-row ${cur ? 'is-current' : ''}" draggable="true" data-note="${n.id}" data-drop="${n.subjectId}|${n.unitId || ''}">
        <button class="row-main" type="button" data-act="open" data-id="${n.id}">
          ${icon('note')}<span class="label-text">${esc(n.title || '無題のノート')}</span><span class="sub">${shortDate(n.updated)}</span>
        </button>
        <button class="more" type="button" data-act="menu" data-kind="note" data-id="${n.id}" aria-haspopup="menu" aria-label="「${esc(n.title || '無題のノート')}」のメニュー">${icon('more')}</button>
      </div>
    </li>`;
}

// 左のツリーを描き直す
function renderSidebar() {
  const tree = $('#tree');
  const q = state.query.trim().toLowerCase();

  // 検索中: ツリーの代わりに、場所つきの結果一覧
  if (q) {
    const hits = state.notes.filter((n) => (n.title + '\n' + n.body).toLowerCase().includes(q));
    tree.innerHTML = `<li class="result-head">検索結果 ${hits.length}件</li>` + (hits.length
      ? hits.map((n) => `
        <li role="treeitem" aria-selected="${n.id === state.noteId}">
          <div class="row note-row ${n.id === state.noteId ? 'is-current' : ''}">
            <button class="row-main" type="button" data-act="open" data-id="${n.id}">
              ${icon('note')}<span class="label-text">${esc(n.title || '無題のノート')}</span><span class="sub">${esc(pathOf(n).join(' › '))}</span>
            </button>
          </div>
        </li>`).join('')
      : '<li class="empty">見つかりませんでした</li>');
    return;
  }

  if (!state.subjects.length) {
    tree.innerHTML = `<li class="tree-empty">科目がまだありません<button class="btn" type="button" data-act="add-subject">${icon('plus')}科目を追加</button></li>`;
    return;
  }

  // 科目ごとに「単元 (中のノート)」→「科目直下のノート」の順に並べる
  tree.innerHTML = state.subjects.map((s) => {
    const count = state.notes.filter((n) => n.subjectId === s.id).length;
    const rootNotes = notesIn(s.id, null);
    const children = s.units.map((u) => {
      const notes = notesIn(s.id, u.id);
      return `
        <li role="treeitem" class="t-unit" aria-expanded="${u.open}">
          <div class="row" data-drop="${s.id}|${u.id}">
            <button class="row-main" type="button" data-act="toggle" data-kind="unit" data-sid="${s.id}" data-id="${u.id}">
              ${icon('chev', 'chev')}<span class="label-text">${esc(u.name)}</span><span class="sub">${notes.length}</span>
            </button>
            <button class="more" type="button" data-act="menu" data-kind="unit" data-sid="${s.id}" data-id="${u.id}" aria-haspopup="menu" aria-label="単元「${esc(u.name)}」のメニュー">${icon('more')}</button>
          </div>
          ${u.open ? `<ul role="group">${notes.map(noteRow).join('') || '<li class="empty">ノートがありません</li>'}</ul>` : ''}
        </li>`;
    }).join('') + rootNotes.map(noteRow).join('');

    return `
      <li role="treeitem" class="t-subject" aria-expanded="${s.open}">
        <div class="row" data-drop="${s.id}|">
          <button class="row-main" type="button" data-act="toggle" data-kind="subject" data-id="${s.id}">
            ${icon('chev', 'chev')}<span class="label-text">${esc(s.name)}</span><span class="sub">${count}</span>
          </button>
          <button class="more" type="button" data-act="menu" data-kind="subject" data-id="${s.id}" aria-haspopup="menu" aria-label="科目「${esc(s.name)}」のメニュー">${icon('more')}</button>
        </div>
        ${s.open ? `<ul role="group">${children || '<li class="empty">単元もノートもありません</li>'}</ul>` : ''}
      </li>`;
  }).join('');
}

// =========================================================
// ノート本文 (リッチテキスト)
// =========================================================
const editor = $('#editor');
const PLACEHOLDER = editor.dataset.placeholder;
const htmlOf = (note) => note.html ?? renderMarkdown(note.body || '');

// 検索のハイライト (mark[data-hl]) を外した本文
function unmark(root) {
  root.querySelectorAll('mark[data-hl]').forEach((m) => m.replaceWith(...m.childNodes));
  root.normalize();
}
// ハイライトを外した本文のコピー (保存用)
function cleanCopy() {
  const clone = editor.cloneNode(true);
  unmark(clone);
  return clone;
}

// 本文 → Markdown 風の文字 (用語の読み取り・検索・ホーム画面用)
function inlineMd(node) {
  let s = '';
  node.childNodes.forEach((c) => {
    if (c.nodeType === 3) { s += c.nodeValue; return; }
    if (c.nodeType !== 1) return;
    const t = c.tagName;
    const bold = t === 'B' || t === 'STRONG' || (t === 'SPAN' && /bold|[6-9]00/.test(c.style.fontWeight));
    if (t === 'BR') s += ' ';
    else if (t === 'CODE') s += '`' + c.textContent + '`';
    else if (bold) { const inner = inlineMd(c); s += inner.trim() ? `**${inner}**` : inner; }
    else s += inlineMd(c);
  });
  return s.replace(/\*\*\*\*/g, '');
}
// ブロック (見出し・リスト・表など) を1行ずつ Markdown 風の文字にする
function blockMd(el, out) {
  for (const c of el.childNodes) {
    if (c.nodeType === 3) { if (c.nodeValue.trim()) out.push(c.nodeValue.trim()); continue; }
    if (c.nodeType !== 1) continue;
    const t = c.tagName;
    if (/^H[1-6]$/.test(t)) out.push('#'.repeat(Math.min(3, +t[1])) + ' ' + inlineMd(c).trim());
    else if (t === 'UL' || t === 'OL') {
      const check = c.classList.contains('checklist');
      [...c.children].forEach((li, i) => out.push(`${t === 'OL' ? `${i + 1}.` : '-'} ${check ? (li.classList.contains('done') ? '[x] ' : '[ ] ') : ''}${inlineMd(li).trim()}`));
    }
    else if (t === 'BLOCKQUOTE') out.push('> ' + inlineMd(c).trim());
    else if (t === 'PRE') out.push('```\n' + c.textContent + '\n```');
    else if (t === 'TABLE') c.querySelectorAll('tr').forEach((tr) => out.push([...tr.cells].map((td) => td.textContent.trim()).join(' | ')));
    else if (c.querySelector('h1,h2,h3,h4,h5,h6,ul,ol,table,blockquote,pre,p,div')) blockMd(c, out);
    else { const s = inlineMd(c).trim(); if (s) out.push(s); }
  }
}

// 本文を note.html (見た目) と note.body (文字) の両方に保存する
function saveEditor() {
  const note = currentNote();
  if (!note) return;
  const clean = cleanCopy();
  note.html = clean.innerHTML;
  const out = [];
  blockMd(clean, out);
  note.body = out.join('\n');
  touch(note);
}

// 中央のノート画面 (タイトル・場所・本文) を表示する
function renderNote() {
  const note = currentNote();
  editor.contentEditable = note ? 'true' : 'false';
  if (!note) {
    $('#titleInput').value = '';
    $('#crumbs').innerHTML = '';
    $('#noteMeta').textContent = '';
    editor.innerHTML = '';
    editor.dataset.placeholder = 'ノートを選ぶか、「＋」で新しく作成してください';
    editor.dataset.noteId = '';
    return;
  }
  editor.dataset.placeholder = PLACEHOLDER;
  if (document.activeElement !== $('#titleInput')) $('#titleInput').value = note.title;
  $('#crumbs').innerHTML = `
    <button class="crumb-btn" type="button" id="moveBtn" title="別の科目・単元へ移動">
      ${pathOf(note).map(esc).join('<span class="sep">›</span>')}${icon('down')}
    </button>`;
  $('#noteMeta').textContent = `更新 ${note.updated.replaceAll('-', '.')}`;
  // 書いている最中のノートは、本文を作り直さない (カーソルが飛ぶので)
  if (editor.dataset.noteId !== note.id || document.activeElement !== editor) {
    editor.innerHTML = htmlOf(note);
    editor.dataset.noteId = note.id;
  }
  renderPreview();
}

// 検索語を本文の中で光らせる
function renderPreview() {
  if (!currentNote()) return;
  unmark(editor);
  const q = state.query.trim();
  const count = highlight(editor, q);
  $('#searchCount').textContent = q ? `${count}件` : '';
}

// ノートが入っている科目・単元をツリーで開いておく
function openContainersOf(note) {
  const s = findSubject(note.subjectId);
  if (s) s.open = true;
  const u = findUnit(s, note.unitId);
  if (u) u.open = true;
}

// ノートを選んで、画面全体を切りかえる
function selectNote(id) {
  state.noteId = id;
  const note = currentNote();
  if (note) {
    state.sel = { subjectId: note.subjectId, unitId: note.unitId };
    openContainersOf(note);
  }
  $('#summaryBox').hidden = true;
  $('#summaryBtn').setAttribute('aria-pressed', false);
  renderSidebar();
  renderNote();
  resetAiPanel();
}

// 更新日を今日にして保存する
function touch(note) {
  note.updated = today();
  save();
}

// =========================================================
// 科目・単元・ノートの操作
// =========================================================
let pending = null; // ダイアログで「OK」が押されたときにやること

// ダイアログを開き、OK で閉じたら onOk を呼ぶ
function openDialog(dialog, onOk) {
  pending = onOk;
  dialog.returnValue = '';
  dialog.showModal();
}
// ダイアログが閉じたとき、OK なら予約しておいた処理を実行する (AI の確認画面は confirmAi が自分で扱う)
document.querySelectorAll('dialog:not(#aiConfirm)').forEach((d) => {
  d.addEventListener('close', () => {
    const fn = pending;
    pending = null;
    if (d.returnValue === 'ok' && fn) fn();
  });
});
// 「キャンセル」「×」は送信ボタンにしない (Enter で OK が押されるようにするため)
document.querySelectorAll('dialog [data-close]').forEach((b) => {
  b.addEventListener('click', () => b.closest('dialog').close('cancel'));
});

// 名前を入れるダイアログ (追加・名前変更で共用)
function askName({ title, label, value = '', ok, placeholder = '' }, done) {
  $('#nameTitle').textContent = title;
  $('#nameLabel').textContent = label;
  $('#nameOk').textContent = ok;
  const input = $('#nameInput');
  input.value = value;
  input.placeholder = placeholder;
  openDialog($('#nameDialog'), () => {
    const v = input.value.trim();
    if (v) done(v);
  });
  input.select();
}

// 確認ダイアログ (削除など)
function confirmAction(title, body, okLabel, done) {
  $('#confirmTitle').textContent = title;
  $('#confirmBody').textContent = body;
  $('#confirmOk').textContent = okLabel;
  openDialog($('#confirmDialog'), done);
}

// 科目を追加する。then があれば追加後に呼ぶ
function addSubject(then) {
  askName({ title: '科目を追加', label: '科目名', ok: '追加する', placeholder: '例: 基本情報技術者' }, (name) => {
    const s = { id: uid('s'), name, open: true, units: [] };
    state.subjects.push(s);
    state.sel = { subjectId: s.id, unitId: null };
    save();
    renderSidebar();
    if (then) then(s);
  });
}

// 科目に単元を追加する
function addUnit(sid) {
  const s = findSubject(sid);
  if (!s) return;
  askName({ title: `「${s.name}」に単元を追加`, label: '単元名', ok: '追加する', placeholder: '例: ネットワーク' }, (name) => {
    s.units.push({ id: uid('u'), name, open: true });
    s.open = true;
    save();
    renderSidebar();
  });
}

// 新しいノートを作って開く。科目がなければ先に科目を作る
function addNote(subjectId, unitId) {
  if (!findSubject(subjectId)) {
    addSubject((s) => addNote(s.id, null));
    return;
  }
  const note = { id: uid('n'), subjectId, unitId: unitId || null, title: '', updated: today(), body: '' };
  state.notes.unshift(note);
  state.query = '';
  $('#searchInput').value = '';
  save();
  selectNote(note.id);
  setView('note');
  $('#titleInput').focus();
}

// 科目・単元の名前を変更する
function renameSubject(sid) {
  const s = findSubject(sid);
  if (!s) return;
  askName({ title: '科目の名前を変更', label: '科目名', value: s.name, ok: '変更する' }, (name) => {
    s.name = name; save(); renderSidebar(); renderNote();
  });
}

function renameUnit(sid, id) {
  const u = findUnit(findSubject(sid), id);
  if (!u) return;
  askName({ title: '単元の名前を変更', label: '単元名', value: u.name, ok: '変更する' }, (name) => {
    u.name = name; save(); renderSidebar(); renderNote();
  });
}

// 削除のあと、開いていたノートや選んでいた科目が消えていたら別のものに切りかえる
function afterRemoval() {
  if (!currentNote()) state.noteId = state.notes[0]?.id ?? null;
  if (!findSubject(state.sel.subjectId)) state.sel = { subjectId: state.subjects[0]?.id ?? null, unitId: null };
  save();
  selectNote(state.noteId);
}

// 科目を中の単元・ノートごと削除する
function deleteSubject(sid) {
  const s = findSubject(sid);
  if (!s) return;
  const n = state.notes.filter((x) => x.subjectId === sid).length;
  confirmAction('科目を削除',
    `「${s.name}」と、中の単元${s.units.length}件・ノート${n}件を削除します。元に戻せません。`, '削除する', () => {
      state.subjects = state.subjects.filter((x) => x !== s);
      state.notes = state.notes.filter((x) => x.subjectId !== sid);
      afterRemoval();
    });
}

// 単元を消しても、ノートは消さずに科目の直下へ移す
function deleteUnit(sid, id) {
  const s = findSubject(sid);
  const u = findUnit(s, id);
  if (!u) return;
  const notes = notesIn(sid, id);
  confirmAction('単元を削除',
    notes.length
      ? `「${u.name}」を削除します。中のノート${notes.length}件は消えずに「${s.name}」の直下へ移ります。`
      : `「${u.name}」を削除します。`, '削除する', () => {
      notes.forEach((n) => { n.unitId = null; });
      s.units = s.units.filter((x) => x !== u);
      if (state.sel.unitId === id) state.sel.unitId = null;
      afterRemoval();
    });
}

// ノートを削除する
function deleteNote(id) {
  const n = state.notes.find((x) => x.id === id);
  if (!n) return;
  confirmAction('ノートを削除', `「${n.title || '無題のノート'}」を削除します。元に戻せません。`, '削除する', () => {
    state.notes = state.notes.filter((x) => x !== n);
    afterRemoval();
  });
}

// ノートを別の科目・単元へ移す
function moveNoteTo(id, subjectId, unitId) {
  const n = state.notes.find((x) => x.id === id);
  if (!n || !findSubject(subjectId)) return;
  if (n.subjectId === subjectId && (n.unitId || null) === (unitId || null)) return;
  n.subjectId = subjectId;
  n.unitId = unitId || null;
  openContainersOf(n);
  if (n.id === state.noteId) state.sel = { subjectId, unitId: unitId || null };
  touch(n);
  renderSidebar();
  renderNote();
  toast(`「${n.title || '無題のノート'}」を ${pathOf(n).join(' › ')} へ移動しました`);
}

// 「移動」ダイアログを開く (行き先を科目・単元のリストから選ぶ)
function openMove(id) {
  const n = state.notes.find((x) => x.id === id);
  if (!n) return;
  $('#moveNoteName').textContent = `「${n.title || '無題のノート'}」 いまの場所: ${pathOf(n).join(' › ')}`;
  const cur = `${n.subjectId}|${n.unitId || ''}`;
  $('#moveSelect').innerHTML = state.subjects.map((s) => `
    <optgroup label="${esc(s.name)}">
      <option value="${s.id}|" ${cur === `${s.id}|` ? 'selected' : ''}>${esc(s.name)} (直下)</option>
      ${s.units.map((u) => `<option value="${s.id}|${u.id}" ${cur === `${s.id}|${u.id}` ? 'selected' : ''}>${esc(s.name)} › ${esc(u.name)}</option>`).join('')}
    </optgroup>`).join('');
  openDialog($('#moveDialog'), () => {
    const [sid, unit] = $('#moveSelect').value.split('|');
    moveNoteTo(id, sid, unit);
  });
}

// ---------- 「…」メニュー ----------
const menu = $('#ctxMenu');
let menuItems = [];
let menuOwner = null;

// 科目・単元・ノートの種類に合わせたメニューを、ボタンの近くに開く
function openMenu(btn) {
  const { kind, id, sid } = btn.dataset;
  if (kind === 'subject') {
    menuItems = [
      { label: '単元を追加', icon: 'unit', run: () => addUnit(id) },
      { label: 'ノートを追加', icon: 'note', run: () => addNote(id, null) },
      '-',
      { label: '名前を変更', icon: 'summary', run: () => renameSubject(id) },
      { label: '削除…', icon: 'close', run: () => deleteSubject(id) },
    ];
  } else if (kind === 'unit') {
    menuItems = [
      { label: 'ノートを追加', icon: 'note', run: () => addNote(sid, id) },
      '-',
      { label: '名前を変更', icon: 'summary', run: () => renameUnit(sid, id) },
      { label: '削除…', icon: 'close', run: () => deleteUnit(sid, id) },
    ];
  } else {
    menuItems = [
      { label: '開く', icon: 'note', run: () => { selectNote(id); setView('note'); } },
      { label: '別の科目・単元へ移動…', icon: 'folder', run: () => openMove(id) },
      '-',
      { label: '削除…', icon: 'close', run: () => deleteNote(id) },
    ];
  }
  menu.innerHTML = menuItems.map((it, i) => it === '-' ? '<hr>' : `<button type="button" role="menuitem" data-i="${i}">${icon(it.icon)}${it.label}</button>`).join('');
  menu.hidden = false;
  // 画面からはみ出さない位置に出す (下に入らなければ上に出す)
  const r = btn.getBoundingClientRect();
  const left = Math.min(r.left, innerWidth - menu.offsetWidth - 8);
  let top = r.bottom + 4;
  if (top + menu.offsetHeight > innerHeight - 8) top = Math.max(8, r.top - menu.offsetHeight - 4);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${top}px`;
  menuOwner = btn;
  btn.setAttribute('aria-expanded', 'true');
  menu.querySelector('button').focus();
}

// メニューを閉じる。refocus なら元のボタンにフォーカスを戻す
function closeMenu(refocus) {
  if (menu.hidden) return;
  menu.hidden = true;
  if (menuOwner) {
    menuOwner.setAttribute('aria-expanded', 'false');
    if (refocus && menuOwner.isConnected) menuOwner.focus();
  }
  menuOwner = null;
}

// メニューの項目を押したら実行する
menu.addEventListener('click', (e) => {
  const b = e.target.closest('[data-i]');
  if (!b) return;
  const item = menuItems[Number(b.dataset.i)];
  closeMenu(false);
  item.run();
});
// 上下キーで項目を移動する
menu.addEventListener('keydown', (e) => {
  const items = [...menu.querySelectorAll('button')];
  const i = items.indexOf(document.activeElement);
  if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
  if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
});
// メニューの外を押す・Esc・画面サイズの変更・スクロールで閉じる
document.addEventListener('pointerdown', (e) => {
  if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('[data-act="menu"]')) closeMenu(false);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(true); });
window.addEventListener('resize', () => closeMenu(false));
$('.panel').addEventListener('scroll', () => closeMenu(false));

// ---------- ツリーのクリック / 右クリック ----------
// data-act で「開く / 開閉 / メニュー / 科目追加」を振り分ける
$('#tree').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const { act, kind, id, sid } = b.dataset;
  if (act === 'open') {
    selectNote(id);
    setView('note');
  } else if (act === 'toggle') {
    const target = kind === 'subject' ? findSubject(id) : findUnit(findSubject(sid), id);
    if (!target) return;
    target.open = !target.open;
    state.sel = { subjectId: kind === 'subject' ? id : sid, unitId: kind === 'unit' ? id : null };
    save();
    renderSidebar();
    $(`#tree [data-act="toggle"][data-id="${id}"]`)?.focus();
  } else if (act === 'menu') {
    if (menuOwner === b) closeMenu(false); else { closeMenu(false); openMenu(b); }
  } else if (act === 'add-subject') {
    addSubject();
  }
});
// 右クリックでも「…」メニューを開く
$('#tree').addEventListener('contextmenu', (e) => {
  const more = e.target.closest('.row')?.querySelector('[data-act="menu"]');
  if (!more) return;
  e.preventDefault();
  closeMenu(false);
  openMenu(more);
});

// ---------- ドラッグで移動 (PC) ----------
let dragId = null;
const clearDrop = () => document.querySelectorAll('.drop-over').forEach((el) => el.classList.remove('drop-over'));
// ノートの行をつかんだら、その ID を覚える
$('#tree').addEventListener('dragstart', (e) => {
  const row = e.target.closest('[data-note]');
  if (!row) return;
  dragId = row.dataset.note;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
  closeMenu(false);
});
// 落とせる行 (科目・単元・ノート) の上にいる間は枠を光らせる
$('#tree').addEventListener('dragover', (e) => {
  const row = e.target.closest('[data-drop]');
  if (!row || !dragId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (!row.classList.contains('drop-over')) { clearDrop(); row.classList.add('drop-over'); }
});
$('#tree').addEventListener('dragleave', (e) => {
  const row = e.target.closest('[data-drop]');
  if (row && !row.contains(e.relatedTarget)) row.classList.remove('drop-over');
});
// 落とした行の科目・単元へノートを移す
$('#tree').addEventListener('drop', (e) => {
  const row = e.target.closest('[data-drop]');
  if (!row || !dragId) return;
  e.preventDefault();
  const [sid, unit] = row.dataset.drop.split('|');
  const id = dragId;
  dragId = null;
  clearDrop();
  moveNoteTo(id, sid, unit);
});
$('#tree').addEventListener('dragend', () => { dragId = null; clearDrop(); });

// 「科目を追加」ボタンと、パンくず (場所) からの移動
$('#addSubjectBtn').addEventListener('click', () => addSubject());
$('#crumbs').addEventListener('click', (e) => {
  if (e.target.closest('#moveBtn') && state.noteId) openMove(state.noteId);
});

// =========================================================
// 右: 復習
// =========================================================
// テスト / 説明チェック のどちらのボタンが押されているかを表示する
function setAiActive(which) {
  $('#quizBtn').setAttribute('aria-pressed', which === 'quiz');
  $('#explainBtn').setAttribute('aria-pressed', which === 'explain');
}

// 右パネルを空の状態に戻す
function resetAiPanel() {
  setAiActive(null);
  $('#aiPanel').innerHTML = '<p class="ai-empty">テストか説明チェックが<br>ここに表示されます</p>';
}

function aiMessage(text) {
  $('#aiPanel').innerHTML = `<p class="ai-empty">${text}</p>`;
}

// ---------- 理解度テスト ----------
// テストは、ノート1つにつき15問を1回だけ作って取っておく。
// 5問・10問はその中から選ぶので、問題数を変えても待たない。本文を書きかえたら作り直す。
const QUIZ_POOL = 15;
const quizCache = new Map(); // ノートの id → { body, promise }
let quizRun = 0; // showQuiz を呼ぶたびに増やす。古い呼び出しが後から画面を書きかえないため

// テスト (15問) を作り始める。作り中・作り済みなら同じものを返す。
// 結果は { questions, isDemo, message }。失敗したら AiError で終わる (そのときは覚えておかない)
function aiQuiz(note) {
  const body = note.body || '';
  const hit = quizCache.get(note.id);
  if (hit && hit.body === body) return hit.promise;
  const entry = { body };
  entry.promise = ai.generate({ feature: 'quiz', input: body, options: { count: QUIZ_POOL } }).then((r) => {
    const questions = validQuiz(r.data.questions);
    if (!questions && !r.data.message) throw new ai.AiError('unknown', 'bad_output');
    return { questions, isDemo: r.isDemo, message: r.data.message };
  });
  entry.promise.catch(() => { if (quizCache.get(note.id) === entry) quizCache.delete(note.id); });
  quizCache.set(note.id, entry);
  return entry.promise;
}

// このノートのテストを作り済み・作り中か (それなら AI をもう一度呼ばないので、確認もいらない)
function quizStored(note) {
  const hit = quizCache.get(note.id);
  return !!hit && hit.body === (note.body || '');
}

// 問題の束から count 問を選び、選択肢の並びも毎回変える
const pickQuestions = (pool, count) =>
  shuffle(pool).slice(0, count).map((q) => ({ ...q, choices: shuffle(q.choices) }));

// 理解度テストを表示する。新しく作るときは確認画面を出し、作っている間は「考え中」と経過秒数を出す
async function showQuiz(count = 5) {
  const note = currentNote();
  if (!note) return;
  if (!(note.body || '').trim()) { setAiActive('quiz'); aiMessage('ノートに内容を書くと、テストを作れます'); return; }
  if (!quizStored(note) && !(await confirmAi('quiz'))) return; // キャンセルなら今の画面のまま
  if (note !== currentNote()) return;
  setAiActive('quiz');
  const panel = $('#aiPanel');
  const run = ++quizRun;

  const t0 = Date.now();
  const label = showThinking(panel, '考え中… 問題を作っています');
  const timer = setInterval(() => { label.textContent = `考え中… 問題を作っています (${Math.round((Date.now() - t0) / 1000)}秒)`; }, 1000);
  // 待つ間に別のノート・別の画面へ移っていたら、何もしない
  const stale = () => run !== quizRun || note !== currentNote() || !panel.contains(label);
  let result;
  try {
    result = await aiQuiz(note);
  } catch (e) {
    if (!stale()) aiMessage(esc(aiErrorText(e)));
    return;
  } finally {
    clearInterval(timer);
  }
  if (stale()) return;
  if (!result.questions) { aiMessage(esc(result.message)); return; }
  renderQuiz(note, pickQuestions(result.questions, count), count, result.isDemo);
}

// テストを画面に描く。isDemo ならデモ表記を付ける
function renderQuiz(note, questions, count, isDemo) {
  const panel = $('#aiPanel');
  panel.innerHTML = `
    <div class="ai-head">
      <h3>理解度テスト</h3>
      <span class="hint">${esc(note.title || '無題のノート')}</span>
    </div>
    <div class="slider">
      <div class="slider-head"><span>問題数</span><b id="quizCountLabel">${count}問</b></div>
      <input type="range" id="quizCount" min="5" max="15" step="5" value="${count}" aria-label="問題数">
    </div>
    ${questions.map((q, i) => `
      <div class="q" data-q="${i}">
        <p class="q-text"><span class="q-num">${String(i + 1).padStart(2, '0')}</span>${esc(q.text)}</p>
        <div class="choices">
          ${q.choices.map((c, j) => `<button type="button" class="choice" data-c="${j}"><span class="kana">${'アイウエ'[j]}</span><span class="ctext">${esc(c)}</span></button>`).join('')}
        </div>
      </div>`).join('')}
    <div class="score"><span id="scoreText">残り ${questions.length}問</span>
      <button type="button" class="btn" id="quizRetry">もう一度</button></div>`;
  if (isDemo) panel.querySelector('.ai-head').after(demoBadge());

  // 選択肢を押したら正解・不正解を色で見せ、点数を数える
  let answered = 0, correct = 0;
  panel.querySelectorAll('.q').forEach((el) => {
    const q = questions[Number(el.dataset.q)];
    const isAnswer = (b) => q.choices[Number(b.dataset.c)] === q.answer;
    el.querySelectorAll('.choice').forEach((btn) => {
      btn.addEventListener('click', () => {
        const right = isAnswer(btn);
        el.querySelectorAll('.choice').forEach((b) => {
          b.disabled = true;
          if (isAnswer(b)) b.classList.add('correct');
        });
        if (!right) btn.classList.add('wrong');
        answered++;
        if (right) correct++;
        const done = answered === questions.length;
        const score = $('#scoreText');
        score.classList.toggle('done', done);
        score.textContent = done
          ? `${correct} / ${questions.length}`
          : `残り ${questions.length - answered}問`;
      });
    });
  });
  // 問題数を変えた・もう一度: 作り置きから選び直す (AI をもう一度呼ぶのは本文が変わったときだけ)
  $('#quizCount').addEventListener('input', (e) => { $('#quizCountLabel').textContent = `${e.target.value}問`; });
  $('#quizCount').addEventListener('change', (e) => showQuiz(Number(e.target.value)));
  $('#quizRetry').addEventListener('click', () => showQuiz(count));
}

// 「自分の言葉で説明する」画面。書いた説明を AI が採点する
function showExplain() {
  const note = currentNote();
  if (!note) return;
  setAiActive('explain');
  const terms = parseTerms(note.body);
  if (!terms.length) {
    aiMessage('ノートに用語がまだありません。<br><code>- **用語**: 説明</code> の形で書いてみてください');
    return;
  }
  const panel = $('#aiPanel');
  panel.innerHTML = `
    <div class="ai-head"><h3>自分の言葉で説明する</h3></div>
    <label class="field"><span>説明する用語</span>
      <select id="exTerm">${terms.map((t, i) => `<option value="${i}">${esc(t.term)}</option>`).join('')}</select>
    </label>
    <label class="field"><span>ノートを見ずに説明してみよう</span>
      <textarea id="exText" placeholder="友だちに教えるつもりで書いてみましょう"></textarea>
    </label>
    <button type="button" class="btn btn-primary" id="exCheck">チェックする</button>
    <div id="exResult"></div>`;

  $('#exTerm').addEventListener('change', () => { $('#exResult').innerHTML = ''; });
  $('#exCheck').addEventListener('click', async () => {
    const answer = $('#exText').value.trim();
    const result = $('#exResult');
    if (!answer) { result.innerHTML = '<p class="hint">まず説明を書いてみてください</p>'; return; }
    if (!(await confirmAi('check'))) return;
    showThinking(result, '考え中… 説明を読んでいます');
    const term = terms[Number($('#exTerm').value)];
    let r;
    try {
      r = await ai.generate({ feature: 'check', input: { term: term.term, desc: term.desc, answer } });
    } catch (e) {
      result.innerHTML = `<p class="hint">${esc(aiErrorText(e))}</p>`;
      return;
    }
    const d = { score: Number(r.data.score) || 0, hit: r.data.hit || [], miss: r.data.miss || [] };
    // 点数で3段階の評価にする
    const stamp = d.score >= 80 ? 'よくできました' : d.score >= 40 ? 'もうすこし' : '見直そう';
    const words = (items, cls) => `<p class="words ${cls}">${items.map(esc).join('・')}</p>`;
    result.innerHTML = `
      <div class="feedback">
        <div class="verdict"><div class="stamp">${stamp}</div><div class="ex-comment"></div></div>
        ${d.hit.length ? `<div><span class="hint">入っていた言葉</span>${words(d.hit, 'ok')}</div>` : ''}
        ${d.miss.length ? `<div><span class="hint">抜けていた言葉</span>${words(d.miss, 'ng')}</div>` : ''}
        <div><span class="hint">ノートの説明</span><p class="model">${esc(term.desc)}</p></div>
      </div>`;
    // ひとことはタイピング表示。終わったらデモ表記 (デモのとき)
    await streamInto(result.querySelector('.ex-comment'), ai.streamText(r.text), { isDemo: r.isDemo });
  });
}

// 右パネルをたたむ / 開く (PC)
$('#aiMin').addEventListener('click', () => { document.body.classList.add('ai-collapsed'); $('#aiOpen').focus(); });
$('#aiOpen').addEventListener('click', () => { hideBubble(true); document.body.classList.remove('ai-collapsed'); $('#aiMin').focus(); });

// 「AI」ボタンのふきだし: 画面を開いたときに約10秒だけ出す。ボタンにマウスやフォーカスが来たらまた出す
const bubble = $('#aiBubble');
let bubbleTimer = null;
function showBubble(ms) {
  clearTimeout(bubbleTimer);
  bubble.classList.remove('leaving');
  bubble.hidden = false;
  if (ms) bubbleTimer = setTimeout(() => hideBubble(), ms);
}
function hideBubble(now = false) {
  clearTimeout(bubbleTimer);
  if (bubble.hidden) return;
  if (now) { bubble.hidden = true; return; }
  bubble.classList.add('leaving');
  bubbleTimer = setTimeout(() => { bubble.hidden = true; bubble.classList.remove('leaving'); }, 300);
}
['pointerenter', 'focus'].forEach((ev) => $('#aiOpen').addEventListener(ev, () => showBubble()));
['pointerleave', 'blur'].forEach((ev) => $('#aiOpen').addEventListener(ev, () => hideBubble()));
setTimeout(() => showBubble(10000), 600);

// =========================================================
// アカウント
// - Supabase の設定があるとき: 未ログインなら「ログイン」、ログイン中なら「ログアウト」ボタン
// - 設定が無いとき: これまでどおりの仮登録 (アカウント名をこの端末に保存するだけ)
// =========================================================
// アカウントの表示 (名前・アイコン・ボタン) を更新する
function renderAccount() {
  if (cloud.enabled) {
    const name = (state.name || cloud.user?.email || '').trim();
    $('#avatar').textContent = cloud.user ? name[0] || '' : '';
    $('#avatar').classList.toggle('empty', !cloud.user);
    $('#accountName').textContent = name;
    $('#accountName').hidden = !cloud.user;
    $('#accountRole').textContent = cloud.user ? 'ログイン中' : 'ゲスト';
    $('#registerBtn').textContent = cloud.user ? 'ログアウト' : 'ログイン';
    $('#registerBtn').hidden = false;
    return;
  }
  const name = (state.name || '').trim();
  $('#avatar').textContent = name[0] || '';
  $('#avatar').classList.toggle('empty', !name);
  $('#accountName').textContent = name;
  $('#accountName').hidden = !name;
  $('#accountRole').textContent = name ? '学生' : 'ゲスト';
  $('#registerBtn').hidden = !!name;
}
renderAccount();

// Supabase とのやり取りがうまくいかなかったときのお知らせ
if (cloudStatus === 'offline') toast('クラウドのノートを読み込めませんでした。この端末の内容を表示しています（クラウドには保存されません）');
addEventListener('cloud-save-error', () => toast('クラウドに保存できませんでした。この端末には保存されています'));

// ボタン: ログイン画面へ / ログアウト / (設定が無いときは) 名前を入れてこの端末に保存する
$('#registerBtn').addEventListener('click', async () => {
  if (cloud.enabled) {
    if (cloud.user) await cloud.signOut(STORAGE_KEY); // 送り残しを送ってから出る
    location.href = 'login.html';
    return;
  }
  $('#accountInput').value = '';
  openDialog($('#accountDialog'), () => {
    const name = $('#accountInput').value.trim();
    if (!name) return;
    state.name = name;
    save();
    renderAccount();
  });
});

// スマホ幅では 科目 / ノート / 復習 を1画面ずつ見せる (PC幅では3つとも出ているので見た目は変わらない)
function setView(view) {
  document.body.dataset.view = view;
  document.querySelectorAll('.tabbar [data-view]').forEach((b) => {
    b.setAttribute('aria-current', b.dataset.view === view);
  });
}
document.querySelectorAll('.tabbar [data-view]').forEach((b) => {
  b.addEventListener('click', () => setView(b.dataset.view));
});
setView('note');

// 「新しいノート」: いま選んでいる科目・単元に作る
$('#newNoteBtn').addEventListener('click', () => addNote(state.sel.subjectId, state.sel.unitId));

// タイトルを変えたらすぐ保存し、ツリーの名前も更新する
$('#titleInput').addEventListener('input', (e) => {
  const note = currentNote();
  if (!note) return;
  note.title = e.target.value;
  touch(note);
  renderSidebar();
});


// 検索: ツリーを結果一覧にし、本文の一致も光らせる
$('#searchInput').addEventListener('input', (e) => {
  state.query = e.target.value;
  renderSidebar();
  renderPreview();
});

// 要点まとめ: もう一度押すと閉じる。考え中 → タイピング表示 → デモ表記
$('#summaryBtn').addEventListener('click', async () => {
  const note = currentNote();
  if (!note) return;
  const box = $('#summaryBox');
  if (!box.hidden) { box.hidden = true; $('#summaryBtn').setAttribute('aria-pressed', false); return; }
  const out = $('#summaryBody');
  const open = () => { box.hidden = false; $('#summaryBtn').setAttribute('aria-pressed', true); setView('note'); };
  if (!(note.body || '').trim()) { open(); out.innerHTML = '<p class="hint">まとめられる内容がまだありません</p>'; return; }
  // 確認画面で「まとめる」を押したときだけ、要点の枠を開いて AI を使う
  if (!(await confirmAi('summary')) || note !== currentNote()) return;
  open();
  showThinking(out, '考え中… まとめています');
  try {
    await streamInto(out, ai.generateStream({ feature: 'summary', input: note.body }), { isDemo: ai.isDemo });
  } catch (e) {
    out.innerHTML = `<p class="hint">${esc(aiErrorText(e))}</p>`;
  }
});
$('#summaryClose').addEventListener('click', () => { $('#summaryBox').hidden = true; $('#summaryBtn').setAttribute('aria-pressed', false); });

// テスト・説明チェックのボタン
$('#quizBtn').addEventListener('click', () => showQuiz());
$('#explainBtn').addEventListener('click', showExplain);

// 写真取り込み
let extracted = [];
// ダイアログを開くときに前回の結果を消しておく
$('#photoBtn').addEventListener('click', () => {
  if (!currentNote()) return;
  $('#photoInput').value = '';
  $('#photoPreview').hidden = true;
  $('#dropText').hidden = false;
  $('#dropText').textContent = '手書きノートの写真を撮る / 選ぶ';
  $('#photoResult').hidden = true;
  $('#photoAdd').disabled = true;
  openDialog($('#photoDialog'), null);
});

// 写真を JPEG の base64 にする。手書きの細い線をつぶさないよう、長い辺 2560px・高画質で送る。
// サーバーの上限 (base64 で 300万文字) を超えるときだけ、画質を少しずつ下げる
const PHOTO_MAX_CHARS = 2_900_000;
async function shrinkPhoto(file, max = 2560) {
  // スマホ写真の向き (EXIF) を反映して読み込む
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
  return shrinkPhoto(file, Math.round(max * 0.75)); // それでも大きければ、ひと回り小さくする
}

// 読み取れなかったときの理由 (サーバーが返す細かい理由ごと。無ければ ERROR_MESSAGES を使う)
const PHOTO_ERRORS = {
  timeout: '読み取りに時間がかかりすぎました。もう一度選ぶか、写真を明るく撮り直してください',
  unavailable: 'AIが混み合っています。少し時間をおいてから、もう一度選んでください',
  too_large: '写真が大きすぎます。別の写真を選んでください',
  bad_image: 'この写真の形式は読めません。JPEG / PNG の写真を選んでください',
  no_key: 'AIの設定 (APIキー) がありません',
};

// 写真を選んだら単語を読み取る。精度優先なので1〜2分かかることがある
$('#photoInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = $('#photoPreview');
  img.src = URL.createObjectURL(file);
  img.hidden = false;
  $('#photoResult').hidden = true;
  $('#photoAdd').disabled = true;
  const text = $('#dropText');
  text.hidden = false;
  text.textContent = '写真を確認してください';
  if (!(await confirmAi('photo'))) {
    // 読み取らない。同じ写真をもう一度選べるようにしておく
    e.target.value = '';
    img.hidden = true;
    text.textContent = '手書きノートの写真を撮る / 選ぶ';
    return;
  }
  // 待っている秒数を見せる
  const t0 = Date.now();
  const tick = () => { text.textContent = `考え中… 単語を読み取っています ${Math.round((Date.now() - t0) / 1000)}秒 (精度優先のため1〜2分かかることがあります)`; };
  tick();
  const timer = setInterval(tick, 1000);
  let r = null, failure = null;
  try {
    let image;
    try {
      image = await shrinkPhoto(file);
    } catch {
      throw new ai.AiError('unknown', 'bad_image'); // ブラウザで開けない画像形式 (HEIC など)
    }
    r = await ai.generate({ feature: 'photo', input: { image, mime: 'image/jpeg' } });
  } catch (err) {
    failure = err;
  } finally {
    clearInterval(timer);
  }
  if (e.target.files[0] !== file) return; // 待つ間に別の写真が選ばれた
  if (failure) {
    text.textContent = PHOTO_ERRORS[failure.code] || aiErrorText(failure);
    return;
  }
  if (r.data.message) { text.textContent = r.data.message; return; } // デモでサンプルが無いとき
  const words = (Array.isArray(r.data.words) ? r.data.words : [])
    .filter((w) => w?.term && w?.desc).map((w) => ({ term: String(w.term), desc: String(w.desc) }));
  extracted = words;
  if (!words.length) {
    text.textContent = '用語が見つかりませんでした。明るい場所で、ノートが画面いっぱいになるように撮り直してください';
    return;
  }
  $('#dropText').hidden = true;
  $('#wordList').innerHTML = extracted.map((w, i) => `
    <li><label><input type="checkbox" value="${i}" checked>
      <span><strong>${esc(w.term)}</strong> <small>${esc(w.desc)}</small></span></label></li>`).join('');
  addDemoBadge($('#photoResult'), r.isDemo);
  $('#photoResult').hidden = false;
  $('#photoAdd').disabled = false;
});

// チェックした単語を本文の最後に追加する
$('#photoAdd').addEventListener('click', () => {
  const note = currentNote();
  const picked = [...document.querySelectorAll('#wordList input:checked')].map((c) => extracted[Number(c.value)]);
  if (note && picked.length) {
    unmark(editor);
    editor.insertAdjacentHTML('beforeend',
      `<h2>写真から取り込み</h2><ul>${picked.map((w) => `<li><strong>${esc(w.term)}</strong>: ${esc(w.desc)}</li>`).join('')}</ul>`);
    saveEditor();
    renderSidebar();
    renderNote();
  }
  $('#photoDialog').close();
});

// =========================================================
// 本文の入力
// =========================================================
// Enter で改行したとき <p> で区切る
document.execCommand('defaultParagraphSeparator', false, 'p');
// 入力のたびに保存する
editor.addEventListener('input', () => { convertFonts(); saveEditor(); });
// 貼り付けは文字だけにする (よそのページの書式やスクリプトを持ち込まない)
editor.addEventListener('paste', (e) => {
  e.preventDefault();
  document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
});
// チェックリストの□を押すと、済/未済を切り替える
editor.addEventListener('click', (e) => {
  const li = e.target.closest('ul.checklist > li');
  if (!li || e.clientX - li.getBoundingClientRect().left > 24) return;
  li.classList.toggle('done');
  saveEditor();
});

// =========================================================
// ツールボックス
// =========================================================
const toolbar = $('#toolbar');
const pop = $('#pop');
// 文字色・背景色・文字の大きさの候補と、いま選んでいる値
const FORE = [['黒', '#1b2233'], ['赤', '#e5484d'], ['オレンジ', '#f08c00'], ['緑', '#2f9e44'], ['青', '#1f6bff'], ['紫', '#9c36b5'], ['グレー', '#868e96'], ['水色', '#1098ad'], ['茶', '#8d5a2b']];
const BACK = [['黄', '#fff3a3'], ['緑', '#d3f9d8'], ['青', '#d0ebff'], ['ピンク', '#ffdeeb'], ['紫', '#e5dbff'], ['オレンジ', '#ffe8cc'], ['グレー', '#e9ecef'], ['水色', '#c5f6fa']];
const SIZES = [['小', '13px'], ['標準', '15px'], ['大', '19px'], ['特大', '24px']];
const tools = { fore: '#e5484d', back: '#fff3a3', size: null, painter: null };
$('#foreBar').style.setProperty('--c', tools.fore);
$('#hiliteBar').style.setProperty('--c', tools.back);

// 本文の中で選んでいる範囲を覚えておく (ツールボックスを押すとフォーカスが外れるため)
let savedRange = null;
document.addEventListener('selectionchange', () => {
  const sel = getSelection();
  if (sel.rangeCount && editor.contains(sel.anchorNode)) {
    savedRange = sel.getRangeAt(0).cloneRange();
    updateToolState();
  }
});
// 覚えておいた選択範囲を本文に戻す
function restoreSelection() {
  editor.focus();
  if (savedRange && editor.contains(savedRange.startContainer)) {
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }
}
// 書式コマンドを実行して保存する (css=true なら色などを style で付ける)
function exec(cmd, value = null, css = false) {
  if (!currentNote()) return;
  restoreSelection();
  document.execCommand('styleWithCSS', false, css);
  document.execCommand(cmd, false, value);
  document.execCommand('styleWithCSS', false, false);
  convertFonts();
  saveEditor();
  updateToolState();
}
// 太字などがいまオンかどうか (使えない環境では false)
const qs = (cmd) => { try { return document.queryCommandState(cmd); } catch { return false; } };
// 太字・斜体などのボタンの押された状態を、カーソルの位置に合わせる
function updateToolState() {
  toolbar.querySelectorAll('[data-cmd="bold"],[data-cmd="italic"],[data-cmd="strikeThrough"],[data-cmd="underline"]').forEach((b) => {
    b.setAttribute('aria-pressed', qs(b.dataset.cmd));
  });
}

// 文字の大きさ: fontSize 7 で仮に包んでから、指定の px の span に置きかえる
function convertFonts() {
  const spans = [];
  editor.querySelectorAll('font[size="7"]').forEach((f) => {
    const span = document.createElement('span');
    if (tools.size) span.style.fontSize = tools.size;
    span.append(...f.childNodes);
    f.replaceWith(span);
    spans.push(span);
  });
  // 置きかえで選択が外れるので、同じ範囲を選び直す (続けて色も塗れるように)
  if (spans.length && spans.some((s) => s.textContent)) {
    const r = document.createRange();
    r.setStartBefore(spans[0]);
    r.setEndAfter(spans[spans.length - 1]);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    savedRange = r.cloneRange();
  }
}
// 文字の大きさを変える (px で指定)
function setFontSize(px) {
  tools.size = px;
  exec('fontSize', '7');
}

// 見出しなどのブロックを切りかえる。同じものなら本文 (p) に戻す
function setBlock(tag) {
  const cur = (document.queryCommandValue('formatBlock') || '').toLowerCase();
  exec('formatBlock', cur === tag ? 'p' : tag);
}

// チェックリストのオン/オフ (箇条書きに checklist クラスを付ける)
function toggleChecklist() {
  restoreSelection();
  const sel = getSelection();
  let ul = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement).closest('ul');
  if (!ul || !editor.contains(ul)) {
    document.execCommand('insertUnorderedList');
    const n = getSelection().anchorNode;
    ul = n && (n.nodeType === 1 ? n : n.parentElement).closest('ul');
  }
  if (ul) ul.classList.toggle('checklist');
  saveEditor();
}

// 3列の表 (用語・説明・メモ) を入れる
function insertTable() {
  const cell = '<td><br></td>';
  const row = `<tr>${cell.repeat(3)}</tr>`;
  exec('insertHTML', `<table><tbody><tr><th>用語</th><th>説明</th><th>メモ</th></tr>${row}${row}</tbody></table><p><br></p>`);
}

// 書式のコピー: 押した時点の書式を覚え、次に選んだ文字へ塗る
function capturePainter() {
  restoreSelection();
  const n = getSelection().anchorNode;
  const el = n && (n.nodeType === 1 ? n : n.parentElement);
  if (!el || !editor.contains(el)) { toast('先に、書式をコピーしたい文字を選んでください'); return; }
  let back = 'transparent';
  for (let x = el; x && x !== editor; x = x.parentElement) {
    const bg = getComputedStyle(x).backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && x.tagName !== 'MARK') { back = bg; break; }
  }
  tools.painter = {
    bold: qs('bold'), italic: qs('italic'), underline: qs('underline'), strikeThrough: qs('strikeThrough'),
    color: getComputedStyle(el).color, back, size: getComputedStyle(el).fontSize,
  };
  toolbar.querySelector('[data-cmd="painter"]').setAttribute('aria-pressed', 'true');
  toast('塗りたい文字を選んでください');
}
// 書式のコピー中に文字を選んだら、覚えた書式を塗る
editor.addEventListener('mouseup', () => {
  const p = tools.painter;
  const sel = getSelection();
  if (!p || sel.isCollapsed) return;
  tools.painter = null;
  toolbar.querySelector('[data-cmd="painter"]').setAttribute('aria-pressed', 'false');
  savedRange = sel.getRangeAt(0).cloneRange();
  for (const cmd of ['bold', 'italic', 'underline', 'strikeThrough']) {
    if (qs(cmd) !== p[cmd]) document.execCommand(cmd);
  }
  document.execCommand('styleWithCSS', false, true);
  document.execCommand('foreColor', false, p.color);
  document.execCommand('hiliteColor', false, p.back);
  document.execCommand('styleWithCSS', false, false);
  setFontSize(p.size);
});

// 全画面表示のオン/オフ (Esc でも戻る)
function setFull(on) {
  document.body.classList.toggle('note-full', on);
  toolbar.querySelector('[data-cmd="fullscreen"]').disabled = on;
  toolbar.querySelector('[data-cmd="exitFullscreen"]').disabled = !on;
  editor.focus();
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('note-full') && pop.hidden) setFull(false);
});

// ツールボックスの「復習」から、右パネルの各機能を開く
function openReview(btnId) {
  document.body.classList.remove('ai-collapsed');
  if (btnId === 'summaryBtn' || btnId === 'photoBtn') { $(`#${btnId}`).click(); return; }
  setView('review');
  $(`#${btnId}`).click();
}

// ツールボックスのボタン (data-cmd) ごとの処理
const actions = {
  undo: () => exec('undo'),
  redo: () => exec('redo'),
  painter: () => {
    if (tools.painter) { tools.painter = null; toolbar.querySelector('[data-cmd="painter"]').setAttribute('aria-pressed', 'false'); return; }
    capturePainter();
  },
  removeFormat: () => exec('removeFormat'),
  bold: () => exec('bold'),
  italic: () => exec('italic'),
  strikeThrough: () => exec('strikeThrough'),
  underline: () => exec('underline'),
  marker: () => exec('hiliteColor', '#fff3a3', true),
  table: insertTable,
  checklist: toggleChecklist,
  foreColor: () => exec('foreColor', tools.fore, true),
  hiliteColor: () => exec('hiliteColor', tools.back, true),
  fullscreen: () => setFull(true),
  exitFullscreen: () => setFull(false),
};

// --- プルダウン ---
// ボタン (data-pop) ごとのプルダウンの中身と、項目を押したときの処理
const pops = {
  review: () => ({
    html: `<button type="button" data-i="quizBtn">${icon('test')}テストを作る</button>
      <button type="button" data-i="explainBtn">${icon('explain')}自分の言葉で説明する</button>
      <button type="button" data-i="summaryBtn">${icon('summary')}要点をまとめる</button>
      <button type="button" data-i="photoBtn">${icon('photo')}写真から取り込む</button>`,
    run: (b) => openReview(b.dataset.i),
  }),
  heading: () => ({
    html: [['h1', '大見出し', 20], ['h2', '中見出し', 17], ['h3', '小見出し', 15], ['h4', '見出し4', 13.5], ['p', '本文', 13]]
      .map(([t, l, s]) => `<button type="button" data-i="${t}"><span style="font-size:${s}px;font-weight:${t === 'p' ? 400 : 600}">${l}</span></button>`).join(''),
    run: (b) => exec('formatBlock', b.dataset.i),
  }),
  size: () => ({
    html: '<p class="pop-title">文字の大きさ</p>' + SIZES.map(([l, px]) => `<button type="button" class="size-item" data-i="${px}"><span style="font-size:${px}">${l}</span><small class="hint">${px}</small></button>`).join(''),
    run: (b) => setFontSize(b.dataset.i),
  }),
  list: () => ({
    html: `<button type="button" data-i="insertUnorderedList">${icon('summary')}箇条書き</button>
      <button type="button" data-i="insertOrderedList"><b style="width:16px;font-size:11px">1.</b>番号付き</button>
      <button type="button" data-i="checklist">${icon('test')}チェックリスト</button>`,
    run: (b) => (b.dataset.i === 'checklist' ? toggleChecklist() : exec(b.dataset.i)),
  }),
  align: () => ({
    html: [['justifyLeft', '左そろえ'], ['justifyCenter', '中央そろえ'], ['justifyRight', '右そろえ']]
      .map(([c, l]) => `<button type="button" data-i="${c}">${l}</button>`).join(''),
    run: (b) => exec(b.dataset.i),
  }),
  fore: () => ({
    html: '<p class="pop-title">文字色</p><div class="swatches">'
      + FORE.map(([l, c]) => `<button type="button" data-i="${c}" style="--c:${c}" title="${l}" aria-label="${l}"></button>`).join('')
      + '<button type="button" class="none" data-i="" title="元の色" aria-label="元の色"></button></div>',
    run: (b) => {
      if (!b.dataset.i) { exec('foreColor', getComputedStyle(editor).color, true); return; }
      tools.fore = b.dataset.i;
      $('#foreBar').style.setProperty('--c', tools.fore);
      exec('foreColor', tools.fore, true);
    },
  }),
  hilite: () => ({
    html: '<p class="pop-title">背景色</p><div class="swatches">'
      + BACK.map(([l, c]) => `<button type="button" data-i="${c}" style="--c:${c}" title="${l}" aria-label="${l}"></button>`).join('')
      + '<button type="button" class="none" data-i="" title="なし" aria-label="なし"></button></div>',
    run: (b) => {
      if (!b.dataset.i) { exec('hiliteColor', 'transparent', true); return; }
      tools.back = b.dataset.i;
      $('#hiliteBar').style.setProperty('--c', tools.back);
      exec('hiliteColor', tools.back, true);
    },
  }),
};
let popRun = null;
let popOwner = null;
// プルダウンをボタンの下に開く
function openPop(btn) {
  const def = pops[btn.dataset.pop]();
  pop.innerHTML = def.html;
  popRun = def.run;
  pop.hidden = false;
  const r = btn.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(r.left, innerWidth - pop.offsetWidth - 8))}px`;
  pop.style.top = `${r.bottom + 6}px`;
  popOwner = btn;
  btn.setAttribute('aria-expanded', 'true');
}
function closePop() {
  if (pop.hidden) return;
  pop.hidden = true;
  popOwner?.setAttribute('aria-expanded', 'false');
  popOwner = null;
}
// ツールボックスを押しても、本文で選んでいる文字が外れないようにする
[toolbar, pop].forEach((el) => el.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); }));
// ツールボックスのクリック: プルダウン / 見出し / 各コマンドへ振り分ける
toolbar.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.disabled) return;
  if (b.dataset.pop) { const same = popOwner === b; closePop(); if (!same) openPop(b); return; }
  closePop();
  if (b.dataset.block) setBlock(b.dataset.block);
  else if (actions[b.dataset.cmd]) actions[b.dataset.cmd]();
});
// プルダウンの項目を押したら実行して閉じる
pop.addEventListener('click', (e) => {
  const b = e.target.closest('[data-i]');
  if (!b) return;
  const run = popRun;
  closePop();
  run(b);
});
// 外を押す・Esc・画面サイズの変更・スクロールでプルダウンを閉じる
document.addEventListener('pointerdown', (e) => {
  if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('[data-pop]')) closePop();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePop(); });
window.addEventListener('resize', closePop);
$('.main').addEventListener('scroll', closePop);

// ---------- トースト ----------
// 画面の下に短いメッセージを少しだけ出す
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { t.hidden = true; }, 2400);
}

// ---------- 初期表示 ----------
// 復習パネルは最初は閉じておき、右下の丸い「AI」ボタンで開く (スマホは下のタブで開く)
document.body.classList.add('ai-collapsed');
if (state.noteId) openContainersOf(currentNote());
renderSidebar();
renderNote();
resetAiPanel();
// ホームの「＋」から来たら、新しいノートを作る
if (location.hash === '#new') {
  history.replaceState(null, '', location.pathname);
  addNote(state.sel.subjectId, state.sel.unitId);
}
