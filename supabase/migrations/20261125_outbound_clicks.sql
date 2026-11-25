-- 23ai: click-uri pe linkurile ieșite de pe 23citybreak (Kiwi, Skyscanner, Airbnb, Booking, Klook...) pentru rezumatul zilnic pe email.
-- GDPR: se salvează DOAR partenerul, pagina, orașul/evenimentul și momentul. Fără IP, user-agent, cookie, cont sau alt identificator.
-- Scriu și citesc doar funcțiile click-log / click-digest (service role). Fără politici RLS = anon/authenticated nu au acces.
-- Documentație: supabase/SCHEMA.md

create table if not exists public.outbound_clicks (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  partner text not null check (partner ~ '^[A-Za-z0-9 .-]{2,30}$'),   -- ex. Kiwi, Skyscanner, Airbnb, Booking, Klook
  page text not null check (page ~ '^[a-z0-9._-]{1,40}$'),            -- fișierul paginii sursă, ex. index, evenimente, weekend
  city text check (char_length(city) <= 80),                          -- destinația din link (oraș sau cod IATA), dacă se poate deduce
  label text check (char_length(label) <= 100),                       -- titlul cardului/evenimentului în care s-a dat click, dacă există
  digested_at timestamptz                                             -- null = încă neinclus într-un rezumat trimis
);

create index if not exists outbound_clicks_pending on public.outbound_clicks (created_at) where digested_at is null;

alter table public.outbound_clicks enable row level security;
-- Intenționat fără politici: nimeni în afară de service role nu citește sau scrie.

-- Curățenie (opțional, o dată pe zi; click-digest șterge oricum rândurile trimise mai vechi de 90 de zile):
-- select cron.schedule('outbound-clicks-cleanup', '50 4 * * *', $$ delete from public.outbound_clicks where digested_at < now() - interval '90 days' $$);
