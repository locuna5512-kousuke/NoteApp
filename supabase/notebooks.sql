-- NoteApp のノートを Supabase に保存するための表。
-- Supabase の管理画面 → SQL Editor にこのファイルの中身を貼り付けて、1回だけ Run する。
--
-- 1人につき1行。localStorage の noteapp.v2 と同じ JSON（subjects / notes / name）を data にまるごと入れる。

create table if not exists public.notebooks (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- RLS（行ごとのアクセス制限）を有効にする。
-- 有効にしてポリシーを作らないと、誰も読み書きできない（＝安全側）
alter table public.notebooks enable row level security;

-- ログインしている本人の行だけ、読む・作る・書き換える・消すことができる
drop policy if exists "own notebook: select" on public.notebooks;
create policy "own notebook: select" on public.notebooks
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "own notebook: insert" on public.notebooks;
create policy "own notebook: insert" on public.notebooks
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "own notebook: update" on public.notebooks;
create policy "own notebook: update" on public.notebooks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own notebook: delete" on public.notebooks;
create policy "own notebook: delete" on public.notebooks
  for delete to authenticated
  using ((select auth.uid()) = user_id);
