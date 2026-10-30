-- Keep full birth dates private. Public discovery exposes age only.
create or replace view public.discover_profiles
with (security_invoker = true) as
select id, display_name,
  extract(year from age(current_date, date_of_birth))::integer as age,
  country, city, bio, interests, avatar_url, is_verified, created_at
from public.profiles
where is_active = true;

grant select on public.discover_profiles to authenticated;
