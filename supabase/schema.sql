-- Pdash cloud storage. Run once in Supabase → SQL Editor.
-- Each signed-in user gets exactly one row holding their full save (JSONB).
-- Row-level security ensures a user can only ever read or write their own row.

create table if not exists public.user_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

drop policy if exists "user_state_select_own" on public.user_state;
drop policy if exists "user_state_insert_own" on public.user_state;
drop policy if exists "user_state_update_own" on public.user_state;
drop policy if exists "user_state_delete_own" on public.user_state;

create policy "user_state_select_own" on public.user_state
  for select to authenticated using (auth.uid() = user_id);

create policy "user_state_insert_own" on public.user_state
  for insert to authenticated with check (auth.uid() = user_id);

create policy "user_state_update_own" on public.user_state
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_state_delete_own" on public.user_state
  for delete to authenticated using (auth.uid() = user_id);
