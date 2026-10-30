-- VELORA hardening and missing social foundations.
-- Run after 202610300001_initial_schema.sql and 202610300002_private_birth_dates.sql.

-- Birth dates must never be directly selectable by authenticated clients.
revoke select on table public.profiles from authenticated;
grant select (id, display_name, gender, country, city, bio, interests, avatar_url,
              gallery_urls, is_verified, is_active, created_at, updated_at)
on public.profiles to authenticated;

-- The view runs with its owner's privileges so it can calculate age without
-- granting clients access to date_of_birth. It explicitly excludes blocked pairs.
drop view if exists public.discover_profiles;
create view public.discover_profiles
with (security_barrier = true) as
select p.id, p.display_name,
  extract(year from age(current_date, p.date_of_birth))::integer as age,
  p.country, p.city, p.bio, p.interests, p.avatar_url, p.is_verified, p.created_at
from public.profiles p
where p.is_active = true
  and p.id <> auth.uid()
  and not exists (
    select 1 from public.blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
       or (b.blocker_id = p.id and b.blocked_id = auth.uid())
  );
grant select on public.discover_profiles to authenticated;

-- Social graph and safety reports.
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);
create table if not exists public.profile_visits (
  visitor_id uuid not null references public.profiles(id) on delete cascade,
  visited_id uuid not null references public.profiles(id) on delete cascade,
  visited_at timestamptz not null default now(),
  primary key (visitor_id, visited_id),
  check (visitor_id <> visited_id)
);
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 100),
  details text not null default '' check (char_length(details) <= 2000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);
alter table public.follows enable row level security;
alter table public.profile_visits enable row level security;
alter table public.reports enable row level security;
create policy "users manage their follows" on public.follows
  for all to authenticated using (follower_id = auth.uid())
  with check (follower_id = auth.uid());
create policy "users view visits they made" on public.profile_visits
  for select to authenticated using (visitor_id = auth.uid());
create policy "users record visits" on public.profile_visits
  for insert to authenticated with check (visitor_id = auth.uid());
create policy "users report other profiles" on public.reports
  for insert to authenticated with check (reporter_id = auth.uid());
create policy "users view reports they submitted" on public.reports
  for select to authenticated using (reporter_id = auth.uid());

-- Restrict direct client writes to money-related tables. These will be changed
-- only by trusted server-side functions after payment-provider verification.
revoke insert, update, delete on public.wallets, public.wallet_ledger,
  public.gift_transactions, public.payment_orders, public.user_vip from authenticated;
revoke insert, update, delete on public.gifts from authenticated;

-- Only allow users to update their own profile fields; DOB and verification
-- state remain controlled by trusted server-side processes.
revoke update on public.profiles from authenticated;
grant update (display_name, country, city, bio, interests, avatar_url, gallery_urls, updated_at)
on public.profiles to authenticated;

-- Useful indexes for the social features.
create index if not exists follows_followed_idx on public.follows(followed_id);
create index if not exists profile_visits_visited_idx on public.profile_visits(visited_id, visited_at desc);
create index if not exists reports_status_created_idx on public.reports(status, created_at desc);

-- Do not seed fake members or pretend to verify identity. A production age-
-- assurance provider and moderation workflow must be integrated before launch.
