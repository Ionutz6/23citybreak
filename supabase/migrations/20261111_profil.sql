-- 23ai: cont, preferințe de căutare și orașe văzute (faza A a profilului).
-- Toate tabelele sunt private: fiecare utilizator își vede și își modifică doar rândurile lui (RLS).
-- Documentație: supabase/SCHEMA.md

-- Profilul (un rând per cont). onboarding_done_at = null înseamnă că onboardingul nu a fost încă parcurs (sau sărit).
create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  display_name text check (char_length(display_name) <= 60),
  onboarding_done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Preferințele de căutare (pasul 1 din onboarding, editabile din profil).
create table public.search_preferences (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  departure_airports text[] not null default '{}' check (cardinality(departure_airports) <= 10),
  budget_max_eur int check (budget_max_eur between 20 and 5000),
  temp_min_c int check (temp_min_c between -30 and 45),
  temp_max_c int check (temp_max_c between -30 and 45),
  city_mode text not null default 'any' check (city_mode in ('new', 'any')),
  updated_at timestamptz not null default now(),
  check (temp_min_c is null or temp_max_c is null or temp_min_c <= temp_max_c)
);

-- Orașele văzute. city_id = slugul Kiwi fără prefixul „City:” (ex. „prague_cz”, „cluj-napoca_ro”).
create table public.visited_cities (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  city_id text not null check (city_id ~ '^[a-z0-9-]+_[a-z]{2}$'),
  visited_on date,
  source text not null default 'manual' check (source in ('manual', 'onboarding', 'map', 'prompt')),
  created_at timestamptz not null default now(),
  primary key (user_id, city_id)
);

alter table public.profiles enable row level security;
alter table public.search_preferences enable row level security;
alter table public.visited_cities enable row level security;

create policy "own profile: read" on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy "own profile: insert" on public.profiles for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own profile: update" on public.profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own prefs: read" on public.search_preferences for select to authenticated using (user_id = (select auth.uid()));
create policy "own prefs: insert" on public.search_preferences for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own prefs: update" on public.search_preferences for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "own visited: read" on public.visited_cities for select to authenticated using (user_id = (select auth.uid()));
create policy "own visited: insert" on public.visited_cities for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own visited: update" on public.visited_cities for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own visited: delete" on public.visited_cities for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger prefs_touch before update on public.search_preferences for each row execute function public.touch_updated_at();

-- Rândul de profil apare automat la crearea contului (și pentru conturile existente, mai jos).
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles (user_id) values (new.id) on conflict do nothing; return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
insert into public.profiles (user_id) select id from auth.users on conflict do nothing;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Orașele căutate (pentru emailul lunar „ai mai văzut vreun oraș nou?”). Scris prin rpc('record_search').
create table public.search_history (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  city_id text not null check (city_id ~ '^[a-z0-9-]+_[a-z]{2}$'),
  searches int not null default 1,
  first_searched_at timestamptz not null default now(),
  last_searched_at timestamptz not null default now(),
  reminded_at timestamptz,
  primary key (user_id, city_id)
);
alter table public.search_history enable row level security;
create policy "own history: read" on public.search_history for select to authenticated using (user_id = (select auth.uid()));
create policy "own history: delete" on public.search_history for delete to authenticated using (user_id = (select auth.uid()));

create or replace function public.record_search(p_city_ids text[]) returns void language sql security definer set search_path = '' as $$
  insert into public.search_history (user_id, city_id)
  select distinct auth.uid(), c from unnest(p_city_ids[1:20]) c where auth.uid() is not null and c ~ '^[a-z0-9-]+_[a-z]{2}$'
  on conflict (user_id, city_id) do update set searches = public.search_history.searches + 1, last_searched_at = now();
$$;
revoke execute on function public.record_search(text[]) from public, anon;
grant execute on function public.record_search(text[]) to authenticated;

-- Ștergerea contului din profil (GDPR): șterge utilizatorul, iar cascada șterge profil, preferințe, orașe, scoruri, abonare.
create or replace function public.delete_my_account() returns void language sql security definer set search_path = '' as $$
  delete from auth.users where id = auth.uid();
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

