-- Operator queries. Paste these into Supabase → SQL Editor.
--
-- Deliberately not an admin page inside the app: the dashboard is already
-- behind your Supabase login, nothing extra ships to users, and there is no
-- admin UI to leak. If you ever do want one in-app, these same queries work
-- from the client once your account is in app_admins, because the policies
-- allow it — the service_role key is never needed and must never be shipped.
--
-- Before any of this works, add yourself as an admin once:
--
--   insert into public.app_admins (user_id)
--   select id from auth.users where email = 'you@example.com';


-- ── Who has signed up ───────────────────────────────────────────────────────
select
  u.email,
  p.display_name,
  p.created_at                       as joined,
  p.consented_at,
  u.last_sign_in_at
from auth.users u
left join public.profiles p on p.user_id = u.id
order by u.created_at desc;


-- ── Anyone using it without having agreed ───────────────────────────────────
-- Should normally be empty: the app asks before letting them in. A row here
-- means someone signed up before consent existed and has not been back.
select u.email, u.created_at
from auth.users u
left join public.profiles p on p.user_id = u.id
where p.consented_at is null
order by u.created_at desc;


-- ── How active each account is ──────────────────────────────────────────────
-- The save is one JSONB document, so counts come from walking it.
select
  u.email,
  p.display_name,
  jsonb_array_length(coalesce(s.data -> 'goals', '[]'::jsonb))        as goals,
  (select count(*) from jsonb_object_keys(coalesce(s.data -> 'workoutLogs', '{}'::jsonb)))  as workout_days,
  (select count(*) from jsonb_object_keys(coalesce(s.data -> 'importedSets', '{}'::jsonb))) as imported_days,
  coalesce((s.data ->> 'totalXp')::int, 0)                            as total_xp,
  coalesce((s.data ->> 'streak')::int, 0)                             as streak,
  s.updated_at                                                        as last_save
from public.user_state s
join auth.users u           on u.id = s.user_id
left join public.profiles p on p.user_id = s.user_id
order by s.updated_at desc;


-- ── Every logged set, one row each ──────────────────────────────────────────
-- Flattens the nested save into something you can aggregate or export. Covers
-- sets logged in the Gym tab; imported spreadsheet sets live under
-- 'importedSets' and are shaped slightly differently.
select
  u.email,
  day.key                          as workout_date,
  ex.value ->> 'name'              as exercise,
  (st.value ->> 'weight')::numeric as weight,
  (st.value ->> 'reps')::int       as reps,
  (st.value ->> 'rir')::int        as rir,
  coalesce((st.value ->> 'warmup')::boolean, false) as warmup
from public.user_state s
join auth.users u on u.id = s.user_id
cross join lateral jsonb_each(coalesce(s.data -> 'workoutLogs', '{}'::jsonb))      as day
cross join lateral jsonb_each(coalesce(day.value -> 'ex', '{}'::jsonb))            as ex
cross join lateral jsonb_array_elements(coalesce(ex.value -> 'sets', '[]'::jsonb)) as st
order by u.email, day.key desc;


-- ── Signups per week ────────────────────────────────────────────────────────
select date_trunc('week', created_at)::date as week, count(*) as signups
from auth.users
group by 1
order by 1 desc;


-- ── Storage used, to keep an eye on the free tier ───────────────────────────
select
  pg_size_pretty(sum(pg_column_size(data)))         as total_save_size,
  pg_size_pretty(avg(pg_column_size(data))::bigint) as average_per_user,
  count(*)                                          as accounts
from public.user_state;
