-- 23ai: prețuri de zbor pentru secțiunea „Cele mai ieftine zboruri” de pe Home (23citybreak).
-- Două surse, aceeași tabelă:
--   'travelpayouts' = cache zilnic scris de funcția price-sync (Travelpayouts Data API, service role);
--   'visitor'       = prețul real găsit de un vizitator în căutarea de pe zboruri.html, scris de funcția price-report (service role, validat).
-- Datele sunt publice și fără date personale: `anon` poate doar citi. Home cere o singură interogare, fără Kiwi.
-- Documentație: supabase/SCHEMA.md

create table if not exists public.route_prices (
  origin text not null check (origin ~ '^[A-Z]{3}$'),                  -- cod IATA de plecare, ex. OTP
  dest text not null check (dest ~ '^City:[a-z0-9-]+_[a-z]{2}$'),     -- id Kiwi al orașului, ca în europe-cities.js
  out_date date not null,
  back_date date not null,
  price_eur int not null check (price_eur between 15 and 1500),      -- dus-întors, per persoană
  direct boolean not null default false,
  source text not null check (source in ('travelpayouts', 'visitor')),
  seen_at timestamptz not null default now(),
  primary key (origin, dest, out_date, back_date, source),
  check (back_date > out_date)
);

create index if not exists route_prices_lookup on public.route_prices (origin, out_date, price_eur);

alter table public.route_prices enable row level security;
drop policy if exists route_prices_read on public.route_prices;
create policy route_prices_read on public.route_prices for select to anon, authenticated using (true);
-- Fără politici de scriere: scriu doar funcțiile (service role).

-- Curățenie zilnică: prețurile vechi nu mai folosesc (Home le ignoră oricum după 24 h / 72 h).
-- select cron.schedule('route-prices-cleanup', '40 3 * * *', $$ delete from public.route_prices where seen_at < now() - interval '7 days' or out_date < current_date $$);
