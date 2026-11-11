-- Proof that one account cannot read another's data.
--
-- Run in Supabase → SQL Editor. Every check runs inside a transaction that is
-- rolled back, so nothing is written and nothing is deleted.
--
-- Why this and not "sign up two accounts and try": the SQL editor can
-- impersonate any user by setting the JWT claims the policies read, so the
-- policy itself is tested directly - no inboxes, no passwords, no confirmation
-- emails. It is also stronger, because it tests the database rule rather than
-- whatever the app happened to request.
--
-- The editor normally runs as a superuser, which BYPASSES row-level security.
-- `set local role authenticated` is what makes these checks meaningful; without
-- it every query would return everything and prove nothing.

-- ── Setup: you need at least one real account ───────────────────────────────
-- Sign up through the app first, then find your id:
select id, email from auth.users order by created_at;

-- Paste your id into the checks below in place of YOUR_USER_ID.


-- ── Check 1: you can see your own row ───────────────────────────────────────
-- Expected: 1 (or 0 if you have not saved anything in the app yet).
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"YOUR_USER_ID","role":"authenticated"}';
  select count(*) as my_rows from public.user_state;
rollback;


-- ── Check 2: a different account sees nothing of yours ──────────────────────
-- A made-up user id stands in for "somebody else". Expected: 0.
-- If this returns anything above 0, STOP: the policies are not protecting data.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
  select count(*) as other_users_rows_i_can_see from public.user_state;
  select count(*) as other_users_profiles_i_can_see from public.profiles;
rollback;


-- ── Check 3: a signed-out visitor sees nothing ──────────────────────────────
-- This is the anon key's view - the one that ships in the browser. Expected: 0.
begin;
  set local role anon;
  select count(*) as anon_can_see from public.user_state;
rollback;


-- ── Check 4: an admin sees everything ───────────────────────────────────────
-- Only passes after you have added yourself to app_admins. Expected: the total
-- number of saved accounts.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"YOUR_USER_ID","role":"authenticated"}';
  select public.is_app_admin()           as am_i_admin,
         count(*)                        as rows_i_can_read
  from public.user_state;
rollback;


-- ── Check 5: an admin can read, but NOT write ───────────────────────────────
-- There is deliberately no admin update policy, so this must fail with
-- "new row violates row-level security policy". A success here would mean an
-- admin could silently rewrite someone's training history.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"YOUR_USER_ID","role":"authenticated"}';
  update public.user_state
     set data = '{"tampered":true}'::jsonb
   where user_id <> 'YOUR_USER_ID'::uuid;
rollback;


-- ── Check 6: nobody can promote themselves to admin ─────────────────────────
-- app_admins has no insert policy, so this must fail too. Otherwise any user
-- could grant themselves access to everyone's data.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
  insert into public.app_admins (user_id)
  values ('00000000-0000-0000-0000-000000000001');
rollback;
