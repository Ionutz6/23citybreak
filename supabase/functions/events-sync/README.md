# events-sync

Aduce zilnic în `public.events` evenimentele următoarelor 120 de zile pentru orașele din matrice:

| Sursă | Ce aduce | Cheie |
|---|---|---|
| Ticketmaster Discovery API | concerte, sport, festivaluri în 16 țări (AT, BE, CH, CZ, DE, DK, ES, FI, FR, GB, IE, IT, NL, NO, PL, SE) | `TICKETMASTER_API_KEY` (gratuit, 5.000 apeluri/zi) |
| football-data.org v4 | Champions League, Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Eredivisie, Primeira Liga | `FOOTBALL_DATA_API_KEY` (gratuit, 10 apeluri/minut) |
| `data/evenimente-curatoriate.json` de pe site | festivaluri și sărbători de oraș introduse manual | fără cheie |

Se păstrează doar evenimentele compatibile cu un city break: vineri de la 17:00, sâmbătă, duminică până la 18:00 (ora locală). Evenimentele pe mai multe zile se păstrează mereu.

Orașele și coordonatele se citesc din `assets/city-coords.js` de pe site, deci un oraș nou adăugat acolo intră automat. Meciurile se leagă de oraș prin `TEAM_CITY` din `normalize.ts`; echipele fără oraș apar în răspuns la `log`.

Depinde de migrația `supabase/migrations/20261112_events.sql`. **Nu e încă publicată.**

## Activare

1. Aplică migrația în SQL Editor.
2. Secrete (Dashboard → Edge Functions → Secrets): `TICKETMASTER_API_KEY`, `FOOTBALL_DATA_API_KEY`, `CRON_SECRET` (există deja dacă e activă `visited-reminder`).
3. `supabase functions deploy events-sync --no-verify-jwt`
4. Test fără scriere, pe 3 orașe: `curl -H "x-cron-secret: $CRON_SECRET" "https://lsudthnrumslfscpppix.supabase.co/functions/v1/events-sync?only=tm&limit=3&dry"`
5. Joburi zilnice (pg_cron + pg_net), câte unul per sursă ca fiecare să rămână sub limita de timp a funcției:

```sql
select cron.schedule('events-sync-tm',  '10 3 * * *', $$ select net.http_post(url := 'https://lsudthnrumslfscpppix.supabase.co/functions/v1/events-sync?only=tm',  headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>'), timeout_milliseconds := 150000); $$);
select cron.schedule('events-sync-fd',  '20 3 * * *', $$ select net.http_post(url := 'https://lsudthnrumslfscpppix.supabase.co/functions/v1/events-sync?only=fd',  headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>'), timeout_milliseconds := 150000); $$);
select cron.schedule('events-sync-cur', '30 3 * * *', $$ select net.http_post(url := 'https://lsudthnrumslfscpppix.supabase.co/functions/v1/events-sync?only=cur', headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>'), timeout_milliseconds := 150000); $$);
```

Consum estimat: ~90 de orașe × 2 apeluri Ticketmaster = ~180 apeluri/zi; 8 apeluri football-data.org/zi.

## Condiții de folosire

- football-data.org cere afișarea textului „Football data provided by the Football-Data.org API” acolo unde apar meciurile. Nu folosim logo-urile echipelor.
- Ticketmaster: linkul din `ticket_url` e cel primit de la API; după înscrierea în programul de afiliere (Impact) capătă automat tracking.

## Teste

`node --test supabase/functions/events-sync/normalize.test.ts` (Node 22.18+).
