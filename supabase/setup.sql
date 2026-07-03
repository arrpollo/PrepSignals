-- ============================================================================
-- PrepSignals v.21 — Supabase schema, RLS, triggers
-- Run this ONCE in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- Safe to re-run: everything is IF NOT EXISTS / OR REPLACE / drop-then-create.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  email            text,
  name             text not null default '',
  role             text not null default 'user' check (role in ('user','admin')),
  marketing_opt_in boolean not null default false,
  signup_source    text,          -- which prompt converted: plan / save_debrief / checklist / progress / me / nav / direct
  terms_version    text,          -- effective-date string of the Terms accepted at signup
  target_score     text,          -- e.g. '705 – 745' (from plan answers or account form)
  current_score    text,          -- e.g. '605 – 654'
  test_month       text,          -- 'YYYY-MM' from the account form
  test_timeline    text,          -- e.g. '8 – 12 weeks' (from plan answers)
  weak_area        text,          -- Quant / Verbal / Data Insights / Timing / test day
  prep_stage       text,          -- researching / studying / retaking
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.plans (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  cur        text not null,       -- current-score bucket key (c1..c4)
  tgt        text not null,       -- target band key (b1..b3)
  wk         text not null,       -- weeks bucket key (w1..w4)
  focus      text not null default 'unsure',
  updated_at timestamptz not null default now()
);

create table if not exists public.checklists (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  sig        text not null,       -- plan signature 'cur-tgt-wk-focus' the ticks belong to
  done       jsonb not null default '[]'::jsonb,   -- [true,false,true,false]
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_debriefs (
  user_id    uuid not null references auth.users(id) on delete cascade,
  debrief_id text not null,       -- reddit/gmatclub post id from the static dataset
  created_at timestamptz not null default now(),
  primary key (user_id, debrief_id)
);

create table if not exists public.progress_entries (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,       -- 'YYYY-MM-DD'
  kind       text not null default 'mock' check (kind in ('mock','official')),
  total      int  not null check (total between 205 and 805),
  q          int  check (q  between 60 and 90),
  v          int  check (v  between 60 and 90),
  di         int  check (di between 60 and 90),
  section_focus text,
  review_tags text[] not null default '{}'::text[],
  notes      text,
  created_at timestamptz not null default now()
);

alter table public.progress_entries add column if not exists section_focus text;
alter table public.progress_entries add column if not exists review_tags text[] not null default '{}'::text[];
alter table public.progress_entries add column if not exists notes text;

create table if not exists public.feedback_messages (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete set null,
  email      text not null,
  title      text not null,
  body       text not null,
  status     text not null default 'new' check (status in ('new','reviewing','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_debriefs_debrief_idx on public.saved_debriefs (debrief_id);
create index if not exists progress_entries_user_idx  on public.progress_entries (user_id);
create index if not exists feedback_messages_status_idx on public.feedback_messages (status, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Admin helper (SECURITY DEFINER avoids RLS recursion on profiles)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

-- ---------------------------------------------------------------------------
-- 3. Row Level Security — users see/write only their rows; admin reads all
-- ---------------------------------------------------------------------------
alter table public.profiles         enable row level security;
alter table public.plans            enable row level security;
alter table public.checklists       enable row level security;
alter table public.saved_debriefs   enable row level security;
alter table public.progress_entries enable row level security;
alter table public.feedback_messages enable row level security;

-- no anonymous access to any account table
revoke all on public.profiles, public.plans, public.checklists,
              public.saved_debriefs, public.progress_entries from anon;
revoke all on public.feedback_messages from anon;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert
  with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- users cannot grant themselves admin: column-level privilege excludes `role`
revoke update on public.profiles from authenticated;
grant update (email, name, marketing_opt_in, signup_source, terms_version,
              target_score, current_score, test_month, test_timeline,
              weak_area, prep_stage, updated_at)
  on public.profiles to authenticated;

drop policy if exists plans_select on public.plans;
create policy plans_select on public.plans for select
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists plans_write on public.plans;
create policy plans_write on public.plans for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists checklists_select on public.checklists;
create policy checklists_select on public.checklists for select
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists checklists_write on public.checklists;
create policy checklists_write on public.checklists for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists saved_select on public.saved_debriefs;
create policy saved_select on public.saved_debriefs for select
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists saved_write on public.saved_debriefs;
create policy saved_write on public.saved_debriefs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists progress_select on public.progress_entries;
create policy progress_select on public.progress_entries for select
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists progress_write on public.progress_entries;
create policy progress_write on public.progress_entries for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant insert (user_id, email, title, body) on public.feedback_messages to anon, authenticated;
grant select, update (status, updated_at) on public.feedback_messages to authenticated;

drop policy if exists feedback_insert_anon on public.feedback_messages;
create policy feedback_insert_anon on public.feedback_messages for insert
  with check (user_id is null or user_id = auth.uid());
drop policy if exists feedback_admin_select on public.feedback_messages;
create policy feedback_admin_select on public.feedback_messages for select
  using (public.is_admin());
drop policy if exists feedback_admin_update on public.feedback_messages;
create policy feedback_admin_update on public.feedback_messages for update
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. New-signup trigger: copy signup metadata into profiles.
--    The admin account is assigned by email here — only prepsignals@gmail.com.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, marketing_opt_in, signup_source, terms_version, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name',''),
    coalesce((new.raw_user_meta_data->>'marketing_opt_in')::boolean, false),
    new.raw_user_meta_data->>'signup_source',
    new.raw_user_meta_data->>'terms_version',
    case when lower(new.email) = 'prepsignals@gmail.com' then 'admin' else 'user' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 5. Self-service account deletion (called from the site: Account -> Profile -> Delete account)
-- ---------------------------------------------------------------------------
create or replace function public.delete_user()
returns void
language sql security definer set search_path = public
as $$
  delete from auth.users where id = auth.uid();
$$;
revoke execute on function public.delete_user() from public, anon;
grant execute on function public.delete_user() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. If you signed up BEFORE running this file, make yourself admin now:
-- ---------------------------------------------------------------------------
update public.profiles set role = 'admin' where lower(email) = 'prepsignals@gmail.com';
