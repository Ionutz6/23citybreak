-- EuroLeague (events-sync ?only=eb) scrie source = 'euroleague'. Aplicată manual pe 2026-11-16; aici ca să existe și în repo.
alter table public.events drop constraint if exists events_source_check;
alter table public.events add constraint events_source_check
  check (source = any (array['ticketmaster'::text, 'football-data'::text, 'curated'::text, 'euroleague'::text]));
