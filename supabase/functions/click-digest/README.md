# click-log și click-digest

Numără click-urile pe linkurile ieșite (Kiwi, Skyscanner, Airbnb, Booking, Klook, GetYourGuide, Viator, Ticketmaster, Travelpayouts, Google Flights) și trimite zilnic un rezumat pe email.

- `assets/outbound-clicks.js` (inclus în toate paginile) prinde click-ul și trimite la `click-log`: **partener, pagină, oraș/eveniment**. Fără IP, cookie, cont sau alt identificator.
- `click-log` salvează în `public.outbound_clicks` (migrația `20261125_outbound_clicks.sql`).
- `click-digest` rulează o dată pe zi: dacă există **cel puțin 1 click nou**, trimite emailul (grupat pe partener, pagină, oraș/eveniment) și marchează click-urile ca trimise. **Fără click-uri nu trimite nimic.** Dacă Resend dă eroare, click-urile rămân pentru ziua următoare.

## Activare

1. Rulează `supabase/migrations/20261125_outbound_clicks.sql` în SQL Editor.
2. Secret nou `CLICKS_REPORT_TO` = adresa pe care vrei rezumatul. `RESEND_API_KEY` și `CRON_SECRET` există deja.
3. `supabase functions deploy click-log --no-verify-jwt` și `supabase functions deploy click-digest --no-verify-jwt`
4. Test: `curl -H "x-cron-secret: $CRON_SECRET" "https://lsudthnrumslfscpppix.supabase.co/functions/v1/click-digest?dry"`
5. Cron zilnic, o singură dată (06:20 UTC = 08:20/09:20 ora României):

```sql
select cron.schedule('click-digest', '20 6 * * *', $$ select net.http_post(url := 'https://lsudthnrumslfscpppix.supabase.co/functions/v1/click-digest', headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'events_cron_secret')), timeout_milliseconds := 60000); $$);
```

