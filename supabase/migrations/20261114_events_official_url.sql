-- Link către pagina oficială a evenimentului (site festival / artist / competiție), afișat pe pagina de pachet.
-- Se aplică ÎNAINTE de redeploy-ul funcțiilor events-sync și events-search (upsert-ul scrie coloana nouă).
alter table public.events add column if not exists official_url text check (official_url ~ '^https://');
