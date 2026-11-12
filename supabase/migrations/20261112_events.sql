-- 23ai: evenimente la dată fixă (concerte, meciuri, festivaluri) pentru pachetele de weekend din 23citybreak.
-- Tabelul e un cache scris doar de funcția events-sync (service role). Datele sunt publice (fără date personale),
-- deci, spre deosebire de restul schemei, `anon` are drept de citire.
-- Documentație: supabase/SCHEMA.md

create table public.events (
  id text primary key,                         -- 'tm:<id Ticketmaster>', 'fd:<id meci>', 'cur:<slug>'
  kind text not null check (kind in ('concert', 'football', 'sport', 'festival', 'market', 'city_festival', 'theatre', 'comedy', 'other')),
  title text not null check (char_length(title) <= 200),
  city_id text not null check (city_id ~ '^[a-z0-9-]+_[a-z]{2}$'),   -- slug Kiwi fără „City:”, ca în visited_cities
  venue text,
  starts_at timestamptz not null,
  ends_at timestamptz,                         -- doar pentru evenimente pe mai multe zile
  time_tbc boolean not null default false,     -- ora nu e încă anunțată (frecvent la fotbal)
  artists text[] not null default '{}',
  teams text[] not null default '{}',          -- [gazde, oaspeți]
  competition text,                            -- cod football-data.org: 'CL', 'PL', 'PD', ...
  genres text[] not null default '{}',
  price_min_eur numeric(8,2),
  ticket_url text check (ticket_url ~ '^https://'),
  image_url text check (image_url ~ '^https://'),
  popularity int not null default 0,           -- scor intern de ordonare (0-100)
  source text not null check (source in ('ticketmaster', 'football-data', 'curated')),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create index events_city_start on public.events (city_id, starts_at);
create index events_start on public.events (starts_at);
create index events_kind_start on public.events (kind, starts_at);

alter table public.events enable row level security;
create policy "events: public read" on public.events for select to anon, authenticated using (true);
-- Fără politici de insert/update/delete: scrie doar service role (funcția events-sync).
grant select on public.events to anon, authenticated;
