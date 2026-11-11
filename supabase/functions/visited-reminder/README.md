# visited-reminder

Email lunar „Ai mai vizitat vreun oraș nou?” cu orașele căutate (`search_history`) care nu sunt în `visited_cities`.

Depinde de migrația de profil (`search_history`, `visited_cities`, `subscribers`). **Nu e încă publicată.**

## Activare (după ce migrația de profil e aplicată)

1. Secrete: `RESEND_API_KEY` (există deja), `CRON_SECRET` (o valoare nouă, lungă).
2. `supabase functions deploy visited-reminder --no-verify-jwt`
3. Test fără trimitere: `curl -H "x-cron-secret: $CRON_SECRET" "https://lsudthnrumslfscpppix.supabase.co/functions/v1/visited-reminder?dry"`
4. Job lunar (pg_cron + pg_net), pe 1 ale lunii la 10:00 ora României (08:00 UTC iarna):

```sql
select cron.schedule('visited-reminder', '0 8 1 * *', $$
  select net.http_post(
    url := 'https://lsudthnrumslfscpppix.supabase.co/functions/v1/visited-reminder',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>')
  );
$$);
```

Reguli: doar abonați la newsletter; oraș căutat de cel puțin 3 zile, în ultimele 90 de zile; cel mult un email la 30 de zile pentru același oraș (`reminded_at`); maximum 6 orașe per email. Linkul deschide site-ul cu promptul de marcare (`?orase-vazute=1`).

Linkul de dezabonare duce la `dezabonare.html?t=<unsubscribe_token>`, care cere un clic de confirmare și apelează `rpc('unsubscribe')`.
