# events-search

Căutarea după nume de pe `evenimente.html` („Oasis”, „Coldplay”, „Real Madrid”). Clientul: `assets/events-search.js`.

| Treaptă | Unde | Când |
|---|---|---|
| 1. instant | evenimentele deja încărcate în pagină (fără diacritice, toleranță la 1–2 litere greșite) | la fiecare literă |
| 2. toată tabela | RPC public `search_events` (pg_trgm, `unaccent`) | după 250 ms |
| 3. Ticketmaster | această funcție: `GET /functions/v1/events-search?q=oasis` | la Enter sau după 1 s de pauză, min. 4 litere |

Funcția:
- nu repetă aceeași căutare la Ticketmaster timp de 6 ore (`event_search_cache`);
- face cel mult 1.500 de apeluri de căutare pe zi și 1 apel la 250 ms per instanță (limita TM: 5/s, 5.000/zi; events-sync folosește ~180/zi);
- caută în Europa, 400 de zile înainte, și leagă fiecare eveniment de cel mai apropiat oraș cu zbor (sub 35 km);
- salvează în `public.events` doar ce trece aceleași reguli ca events-sync (weekend, țări TM), deci apare și la ceilalți;
- răspunde mereu din `search_events`, chiar fără cheie (`tm: "off"`).

Răspuns: `{ events, tm: "on"|"cached"|"off"|"limit"|"error", found, weekday }`.

## Activare

1. Migrația `supabase/migrations/20261112_events_search.sql`.
2. `npx supabase functions deploy events-search --project-ref lsudthnrumslfscpppix --no-verify-jwt`
3. Secretul `TICKETMASTER_API_KEY` (același ca la events-sync). Fără el funcția merge, doar fără treapta 3.

## Alerte „Anunță-mă când apare”

Tabela `event_alerts` (un rând per cont și căutare, max. 30 active). Deocamdată doar se înregistrează; trimiterea emailului (Resend, după fiecare events-sync) e un pas separat.

## Teste

`node --test supabase/functions/events-search/search.test.ts`
