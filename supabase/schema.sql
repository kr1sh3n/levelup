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

-- ═══════════════════════════════════════════════════════════════════════════
-- Profiles, consent, and operator (admin) access
--
-- The four policies above are deliberately untouched: every user keeps a hard
-- restriction to their own row. Operator access is ADDED alongside, scoped to
-- accounts listed in app_admins, so widening it is a deliberate act (inserting
-- a row) rather than a side effect of a code change.
--
-- The service_role key bypasses every policy below. It must never be used in
-- the app or committed anywhere: anyone who can read it can read and erase all
-- data. Only the anon key belongs in the client.
-- ═══════════════════════════════════════════════════════════════════════════

-- One row per account: who they are, and when they agreed to the terms.
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  consented_at timestamptz,          -- when they accepted; null = never asked
  consent_text text,                 -- exactly what they agreed to, for the record
  created_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Accounts allowed to read everyone's data. Add yourself with:
--   insert into public.app_admins (user_id)
--   select id from auth.users where email = 'you@example.com';
create table if not exists public.app_admins (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;

-- Defined once, used by every admin policy. `security definer` lets the check
-- read app_admins without the caller needing their own access to that table.
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.app_admins a where a.user_id = auth.uid());
$$;

-- Admins may read the list of admins; nobody may edit it from the client.
drop policy if exists "app_admins_select_admin" on public.app_admins;
create policy "app_admins_select_admin" on public.app_admins
  for select to authenticated using (public.is_app_admin());

-- Profiles: your own row, or any row if you are an admin.
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;

create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated using (auth.uid() = user_id or public.is_app_admin());

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = user_id);

create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "profiles_delete_own" on public.profiles
  for delete to authenticated using (auth.uid() = user_id);

-- Saves: the owner keeps full control; an admin may read, never write. There is
-- deliberately no admin insert, update or delete policy.
drop policy if exists "user_state_select_admin" on public.user_state;
create policy "user_state_select_admin" on public.user_state
  for select to authenticated using (public.is_app_admin());

-- Account deletion, callable from the app. Runs as the definer so it can remove
-- the auth user too, and only ever deletes the caller's own account.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in';
  end if;
  delete from public.user_state where user_id = uid;
  delete from public.profiles  where user_id = uid;
  delete from auth.users       where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
