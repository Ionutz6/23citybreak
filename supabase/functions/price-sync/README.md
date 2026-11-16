# price-sync și price-report

Prețurile din secțiunea „Cele mai ieftine zboruri” de pe Home (`assets/home.js`) vin din `public.route_prices`, fără nicio cerere la Kiwi de pe server (Kiwi blochează serverele).

| Sursă | Cum ajunge în tabelă | Valabilitate pe Home |
|---|---|---|
| `travelpayouts` | `price-sync`, zilnic: Travelpayouts Data API (`aviasales/v3/prices_for_dates`), cel mai mic preț găsit de utilizatori în ultimele 48 h, vineri → duminică, următoarele 8 weekenduri, cele 100 de orașe ilustrate | 72 h |
| `visitor` | `price-report`: când cineva caută pe `zboruri.html`, browserul trimite prețurile găsite (validate) | 24 h |

Pentru aceeași rută și dată, prețul `visitor` înlocuiește pe cel `travelpayouts`. Prețul din cache Travelpayouts poate diferi de Kiwi (de obicei cu câteva zeci de euro, uneori mai mult), de aceea Home arată „de la” și trimite la căutare.

## Activare

1. Aplică `supabase/migrations/20261116_route_prices.sql` în SQL Editor.
2. Token Travelpayouts: contul Travelpayouts → Instrumente → API (token-ul de afiliat). Pune-l ca secret `TRAVELPAYOUTS_TOKEN`; `CRON_SECRET` există deja. Opțional `PRICE_ORIGINS` (implicit `OTP`; ex. `OTP,CLJ,IAS`).
3. `supabase functions deploy price-sync --no-verify-jwt` și `supabase functions deploy price-report --no-verify-jwt`
4. Test fără scriere: `curl -H "x-cron-secret: $CRON_SECRET" "https://lsudthnrumslfscpppix.supabase.co/functions/v1/price-sync?limit=3&dry"`. Răspunsul spune câte cereri au dat preț; dacă toate sunt „fără preț” sau „eșuate”, tokenul nu e bun sau contul nu are acces la Data API.
5. Joburi zilnice (două jumătăți, ca fiecare să încapă în timpul funcției):

```sql
select cron.schedule('price-sync-a', '50 3 * * *', $$ select net.http_post(url := 'https://lsudthnrumslfscpppix.supabase.co/functions/v1/price-sync?from=0&limit=50',  headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>'), timeout_milliseconds := 150000); $$);
select cron.schedule('price-sync-b', '55 3 * * *', $$ select net.http_post(url := 'https://lsudthnrumslfscpppix.supabase.co/functions/v1/price-sync?from=50&limit=50', headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>'), timeout_milliseconds := 150000); $$);
```

Fără token, Home folosește doar prețurile `visitor`; până sunt cel puțin 3 orașe cu preț proaspăt, secțiunea rămâne ascunsă.

## Teste

`node --experimental-strip-types --test supabase/functions/price-sync/prices.test.ts`
