-- 23ai: căutare de evenimente după nume (artist, echipă, competiție, oraș, sală) pe evenimente.html.
--   search_events(q)      → RPC public: potriviri fără diacritice și cu toleranță la greșeli de tastare (pg_trgm)
--   event_search_cache    → ce am căutat deja la Ticketmaster (funcția events-search), ca să nu repetăm apelul
--   event_alerts          → „Anunță-mă pe email când apare”: doar înregistrare, trimiterea vine ulterior
-- Depinde de 20261112_events.sql. Documentație: supabase/SCHEMA.md

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Text normalizat: litere mici, fără diacritice, doar litere și cifre (ș/ş, ț/ţ și „Mötley” devin la fel).
create or replace function public.ev_norm(t text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select btrim(regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, ''))), '[^a-z0-9]+', ' ', 'g'))
$$;

-- Numele competițiilor, ca „champions” să găsească meciurile cu competition = 'CL'.
create or replace function public.ev_competition_name(code text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case code
    when 'CL' then 'Champions League Liga Campionilor' when 'PL' then 'Premier League' when 'PD' then 'La Liga'
    when 'SA' then 'Serie A' when 'BL1' then 'Bundesliga' when 'FL1' then 'Ligue 1' when 'DED' then 'Eredivisie'
    when 'PPL' then 'Primeira Liga' when '6N' then 'Six Nations rugby' else coalesce(code, '') end
$$;

create or replace function public.ev_search_text(title text, venue text, artists text[], teams text[], competition text, city_id text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select public.ev_norm(concat_ws(' ', title, venue, array_to_string(artists, ' '), array_to_string(teams, ' '),
    public.ev_competition_name(competition), regexp_replace(city_id, '_[a-z]{2}$', '')))
$$;

alter table public.events add column if not exists search_text text
  generated always as (public.ev_search_text(title, venue, artists, teams, competition, city_id)) stored;
create index if not exists events_search_trgm on public.events using gin (search_text extensions.gin_trgm_ops);

-- Căutare: fiecare cuvânt din q trebuie să se regăsească (exact, ca prefix sau aproximativ). Evenimentele încheiate nu apar.
-- city_ids: orașele potrivite pe client după numele românesc (ex. „Viena” → vienna_at), opțional.
create or replace function public.search_events(q text, city_ids text[] default '{}', lim int default 20)
returns setof public.events
language sql stable security invoker set search_path = '' as $$
  with p as (select public.ev_norm(q) as nq),
  w as (select array_remove(string_to_array((select nq from p), ' '), '') as words)
  select e.* from public.events e, p, w
  where (select nq from p) <> '' and char_length((select nq from p)) <= 80
    and coalesce(e.ends_at, e.starts_at) >= now() - interval '1 day'
    and (
      e.city_id = any(city_ids)
      or not exists (                       -- niciun cuvânt fără potrivire
        select 1 from unnest(w.words) x
        where not (e.search_text like '%' || x || '%' or (char_length(x) >= 4 and extensions.word_similarity(x, e.search_text) >= 0.5))
      )
    )
  order by (e.search_text like '%' || p.nq || '%') desc,
    extensions.word_similarity(p.nq, e.search_text) desc, e.popularity desc, e.starts_at
  limit least(greatest(coalesce(lim, 20), 1), 50)
$$;
grant execute on function public.search_events(text, text[], int) to anon, authenticated;
grant execute on function public.ev_norm(text) to anon, authenticated;

-- Cache-ul căutărilor la Ticketmaster: scrie doar funcția events-search (service role); fără acces public.
create table if not exists public.event_search_cache (
  q_norm text primary key check (char_length(q_norm) between 2 and 80),
  fetched_at timestamptz not null default now(),
  found int not null default 0,              -- evenimente găsite la Ticketmaster în orașele noastre
  status text not null default 'ok'          -- 'ok' | 'error' | 'limit'
);
create index if not exists event_search_cache_fetched on public.event_search_cache (fetched_at);
alter table public.event_search_cache enable row level security;

-- Alerte „Anunță-mă când apare”: un rând per cont și căutare. Trimiterea emailurilor nu e încă implementată.
create table if not exists public.event_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  query text not null check (char_length(btrim(query)) between 2 and 80),
  query_norm text generated always as (public.ev_norm(query)) stored,
  created_at timestamptz not null default now(),
  notified_at timestamptz,                   -- când am trimis emailul (null = încă așteaptă)
  unique (user_id, query_norm)
);
alter table public.event_alerts enable row level security;
create policy "event_alerts: own read" on public.event_alerts for select to authenticated using (user_id = (select auth.uid()));
create policy "event_alerts: own insert" on public.event_alerts for insert to authenticated with check (user_id = (select auth.uid()));
create policy "event_alerts: own delete" on public.event_alerts for delete to authenticated using (user_id = (select auth.uid()));
grant select, insert, delete on public.event_alerts to authenticated;

-- Cel mult 30 de alerte active pe cont (protecție simplă împotriva abuzului).
create or replace function public.event_alerts_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.event_alerts where user_id = new.user_id and notified_at is null) >= 30 then
    raise exception 'Prea multe alerte active (maximum 30).' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists event_alerts_limit on public.event_alerts;
create trigger event_alerts_limit before insert on public.event_alerts for each row execute function public.event_alerts_limit();
