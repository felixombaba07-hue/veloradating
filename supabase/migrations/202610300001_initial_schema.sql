create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  date_of_birth date not null,
  display_name text not null check (char_length(display_name) between 2 and 40),
  gender text not null check (gender in ('woman','man','non_binary','prefer_not_to_say')),
  country text not null default 'Kenya',
  city text,
  bio text not null default '' check (char_length(bio) <= 500),
  interests text[] not null default '{}',
  avatar_url text,
  gallery_urls text[] not null default '{}',
  is_verified boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint adult_only check (date_of_birth <= (current_date - interval '18 years')::date),
  constraint gallery_limit check (cardinality(gallery_urls) <= 10)
);

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles(id) on delete cascade,
  to_user uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(from_user,to_user),
  check (from_user <> to_user)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  user_one uuid not null references public.profiles(id) on delete cascade,
  user_two uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_one < user_two),
  unique(user_one,user_two)
);

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id),
  check(blocker_id <> blocked_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table if not exists public.wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  balance bigint not null default 0 check(balance >= 0),
  currency text not null default 'KES',
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount bigint not null,
  balance_after bigint not null check(balance_after >= 0),
  entry_type text not null check(entry_type in ('topup','gift_sent','gift_received','redemption','refund','adjustment')),
  reference text unique,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text,
  coin_cost bigint not null check(coin_cost > 0),
  is_active boolean not null default true
);

create table if not exists public.gift_transactions (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  gift_id uuid not null references public.gifts(id),
  quantity integer not null default 1 check(quantity between 1 and 100),
  coins_spent bigint not null check(coins_spent > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider_reference text not null unique,
  amount_minor bigint not null check(amount_minor > 0),
  currency text not null default 'KES',
  coin_amount bigint not null check(coin_amount > 0),
  status text not null default 'pending' check(status in ('pending','success','failed')),
  provider_payload jsonb,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create table if not exists public.user_vip (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  tier text not null default 'none' check(tier in ('none','silver','gold','platinum','diamond')),
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.enforce_adult_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.date_of_birth > (current_date - interval '18 years')::date then
    raise exception 'VELORA is only available to people aged 18 or older';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_adult_guard on public.profiles;
create trigger profiles_adult_guard before insert or update of date_of_birth
on public.profiles for each row execute function public.enforce_adult_profile();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare dob date;
begin
  dob := (new.raw_user_meta_data->>'date_of_birth')::date;
  if dob is null or dob > (current_date - interval '18 years')::date then
    raise exception 'VELORA requires users to be at least 18 years old';
  end if;
  insert into public.profiles(id,date_of_birth,display_name,gender,country)
  values(new.id,dob,
    coalesce(nullif(new.raw_user_meta_data->>'display_name',''),'New member'),
    coalesce(nullif(new.raw_user_meta_data->>'gender',''),'prefer_not_to_say'),
    coalesce(nullif(new.raw_user_meta_data->>'country',''),'Kenya'));
  insert into public.wallets(user_id) values(new.id);
  insert into public.user_vip(user_id) values(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_velora on auth.users;
create trigger on_auth_user_created_velora after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.create_mutual_match()
returns trigger language plpgsql security definer set search_path = public as $$
declare a uuid; b uuid;
begin
  if exists(select 1 from public.likes where from_user=new.to_user and to_user=new.from_user)
     and not exists(select 1 from public.blocks where (blocker_id=new.from_user and blocked_id=new.to_user) or (blocker_id=new.to_user and blocked_id=new.from_user)) then
    a := least(new.from_user,new.to_user);
    b := greatest(new.from_user,new.to_user);
    insert into public.matches(user_one,user_two) values(a,b) on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists likes_make_match on public.likes;
create trigger likes_make_match after insert on public.likes
for each row execute function public.create_mutual_match();

create or replace function public.is_match_member(mid uuid, uid uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.matches where id=mid and (user_one=uid or user_two=uid));
$$;

alter table public.profiles enable row level security;
alter table public.likes enable row level security;
alter table public.matches enable row level security;
alter table public.blocks enable row level security;
alter table public.messages enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.gifts enable row level security;
alter table public.gift_transactions enable row level security;
alter table public.payment_orders enable row level security;
alter table public.user_vip enable row level security;

create policy "eligible users can view active profiles" on public.profiles for select to authenticated using (
  is_active and id <> auth.uid() and not exists(select 1 from public.blocks b where
  (b.blocker_id=auth.uid() and b.blocked_id=id) or (b.blocker_id=id and b.blocked_id=auth.uid()))
  or id=auth.uid()
);
create policy "users update own profile" on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy "users create own profile" on public.profiles for insert to authenticated with check(id=auth.uid());
create policy "users see own likes" on public.likes for select to authenticated using(from_user=auth.uid() or to_user=auth.uid());
create policy "users send own likes" on public.likes for insert to authenticated with check(from_user=auth.uid());
create policy "users see own matches" on public.matches for select to authenticated using(user_one=auth.uid() or user_two=auth.uid());
create policy "users manage own blocks" on public.blocks for all to authenticated using(blocker_id=auth.uid()) with check(blocker_id=auth.uid());
create policy "match members read messages" on public.messages for select to authenticated using(public.is_match_member(match_id,auth.uid()));
create policy "match members send messages" on public.messages for insert to authenticated with check(sender_id=auth.uid() and public.is_match_member(match_id,auth.uid()));
create policy "users view own wallet" on public.wallets for select to authenticated using(user_id=auth.uid());
create policy "users view own ledger" on public.wallet_ledger for select to authenticated using(user_id=auth.uid());
create policy "anyone authenticated views active gifts" on public.gifts for select to authenticated using(is_active);
create policy "participants view gifts" on public.gift_transactions for select to authenticated using(sender_id=auth.uid() or recipient_id=auth.uid());
create policy "users view own payments" on public.payment_orders for select to authenticated using(user_id=auth.uid());
create policy "users view own vip" on public.user_vip for select to authenticated using(user_id=auth.uid());

create index if not exists likes_to_user_idx on public.likes(to_user);
create index if not exists messages_match_created_idx on public.messages(match_id,created_at desc);
create index if not exists profiles_active_idx on public.profiles(is_active,created_at desc);
create index if not exists gift_transactions_recipient_idx on public.gift_transactions(recipient_id,created_at desc);

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.matches;
