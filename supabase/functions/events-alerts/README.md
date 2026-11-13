# events-alerts

Emailuri de alertă pentru evenimente. Două tipuri, ambele prin Resend (`office@23ai.ro`):

| Tip | Cine primește | Când | Ce conține |
|---|---|---|---|
| **După nume** (`?only=names`) | cine a apăsat „Anunță-mă pe email când apare” (rânduri în `event_alerts`) | zilnic, dacă a apărut ceva nou | evenimentele noi care se potrivesc textului căutat (căutarea `search_events`, cu toleranță la greșeli); alerta se marchează îndeplinită (`notified_at`), deci e o singură dată |
| **Rezumat din preferințe** (`?only=digest`) | cine a bifat alertele în profil (`event_preferences.event_alerts = true`) | săptămânal | până la 8 evenimente noi, potrivite după artiști/echipe favorite, competiții, sporturi, genuri muzicale și alte motive de drum |

Reguli:
- Doar evenimente „noi” (`events.first_seen_at`): digest = intrate în ultimele 8 zile; nume = intrate după crearea alertei. Doar cele care încep peste cel puțin 2 zile.
- Cel mult un email la 20 de ore per utilizator; rezumatul cel mult o dată la 5 zile; același eveniment nu se mai trimite (`event_mail_log`).
- Ordine în rezumat: artist/echipă favorită, apoi competiție, apoi sport/gen/alt motiv; la egalitate, popularitatea.
- Fiecare email are link „Oprește alertele” → `dezabonare.html?t=<token>&tip=alerte` (`rpc unsubscribe_alerts`: oprește rezumatul și anulează alertele neîmplinite; newsletterul rămâne).
- Cel mult 100 de emailuri pe rulare.
- Nu face filtrare după orașe de plecare sau preț de zbor (alertele de zbor sunt un pas separat).

## Activare
1. Migrația `supabase/migrations/20261113_event_alert_emails.sql`.
2. Secrete: `RESEND_API_KEY`, `CRON_SECRET` (există deja).
3. `npx supabase functions deploy events-alerts --project-ref lsudthnrumslfscpppix --no-verify-jwt`
4. Test fără trimitere: `curl -H "x-cron-secret: $CRON_SECRET" "https://lsudthnrumslfscpppix.supabase.co/functions/v1/events-alerts?dry"`
5. Joburi (după sincronizările de evenimente, care rulează la 01:10–01:30 UTC). Secretul se ia din Vault, ca la events-sync:

```sql
select cron.schedule('events-alerts-names',  '0 6 * * *', $$ select net.http_post(url := 'https://lsudthnrumslfscpppix.supabase.co/functions/v1/events-alerts?only=names',  headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'events_cron_secret')), timeout_milliseconds := 150000); $$);
select cron.schedule('events-alerts-digest', '0 7 * * 4', $$ select net.http_post(url := 'https://lsudthnrumslfscpppix.supabase.co/functions/v1/events-alerts?only=digest', headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'events_cron_secret')), timeout_milliseconds := 150000); $$);
```
(06:00 UTC = 08:00 în România iarna; rezumatul joia la 09:00, ca omul să-și planifice weekendul.)

## Teste
`node --test supabase/functions/events-alerts/match.test.ts`
