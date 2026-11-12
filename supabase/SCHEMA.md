# Schema Supabase „23ai” (cont, profil, preferințe, orașe văzute)

Proiect: **23ai** (ref `lsudthnrumslfscpppix`, EU Frankfurt). Baza aparține 23ai; 23citybreak doar scrie în ea.
Clientul din browser: `assets/account.js` expune `window.Account` (vezi mai jos). Nu crea alt client Supabase.

Migrații: `supabase/migrations/20261111_quiz.sql`, `20261111_quiz_cards.sql`, `20261111_profil.sql`, `20261112_events.sql`, `20261112_event_preferences.sql`.

## Reguli comune

- Toate tabelele au **RLS**: un utilizator conectat (`authenticated`) vede și modifică **doar rândurile lui** (`user_id = auth.uid()`).
- `anon` nu are acces la niciun tabel cu date personale (profilul e privat). Singura excepție: `events`, care e public la citire.
- `user_id` are default `auth.uid()`, deci la insert din browser nu trebuie trimis.
- Ștergerea contului (`rpc('delete_my_account')`) șterge în cascadă toate rândurile de mai jos.

## Tabele

### `profiles` (un rând per cont, creat automat de trigger la crearea contului)

| Coloană | Tip | Note |
|---|---|---|
| `user_id` | uuid PK → auth.users | |
| `display_name` | text ≤ 60 | opțional |
| `onboarding_done_at` | timestamptz | `null` = onboardingul nu a fost parcurs; se setează și când e sărit |
| `created_at`, `updated_at` | timestamptz | `updated_at` prin trigger |

### `search_preferences` (pasul 1 din onboarding; folosit de căutarea personalizată)

| Coloană | Tip | Note |
|---|---|---|
| `user_id` | uuid PK → auth.users | |
| `departure_airports` | text[] ≤ 10 | coduri IATA, ex. `{OTP,CLJ}` (aceleași ca `data-iata` din `#f-origin`) |
| `budget_max_eur` | int 20–5000 | buget maxim dus-întors per persoană, EUR; `null` = fără limită |
| `temp_min_c`, `temp_max_c` | int −30…45 | **nefolosite din 2026-11-12** (filtrul de temperatură a fost scos). Coloanele rămân pentru datele vechi; site-ul nu le mai citește și nu le mai scrie. |
| `city_mode` | `'new'` \| `'any'` | default pentru întrebarea „oraș nou sau oricare?” la căutare |
| `currency` | `'EUR'` \| `'RON'`, default `'EUR'` | moneda în care se afișează prețurile; conversia o face pagina (curs BCE). Migrare: `20261112_moneda.sql` |
| `updated_at` | timestamptz | |

Rândul **poate lipsi** (utilizatorul a sărit pasul): tratează-l ca toate valorile implicite.

### `visited_cities` (orașe văzute)

| Coloană | Tip | Note |
|---|---|---|
| `user_id` | uuid → auth.users | PK compus (`user_id`, `city_id`) |
| `city_id` | text | **slug Kiwi fără prefixul `City:`**, regex `^[a-z0-9-]+_[a-z]{2}$`, ex. `prague_cz`, `cluj-napoca_ro`, `dubrovnik_hr` |
| `visited_on` | date | opțional |
| `source` | `'manual'` \| `'onboarding'` \| `'map'` \| `'prompt'` | de unde a fost marcat |
| `created_at` | timestamptz | |

Exemple:

```js
const sb = await Account.client();
await sb.from('visited_cities').upsert({city_id: 'prague_cz', source: 'map'});
await sb.from('visited_cities').delete().eq('city_id', 'prague_cz');
const {data} = await sb.from('visited_cities').select('city_id');
```

### `search_history` (orașe căutate, pentru emailul lunar „ai mai văzut vreun oraș nou?”)

| Coloană | Tip | Note |
|---|---|---|
| `user_id`, `city_id` | PK compus | `city_id` în același format ca `visited_cities` |
| `searches` | int | câte căutări |
| `first_searched_at`, `last_searched_at` | timestamptz | |
| `reminded_at` | timestamptz | setat de funcția de email (service role) |

Din browser **nu** se scrie direct (doar select/delete): se folosește `rpc('record_search', {p_city_ids: ['prague_cz', ...]})`, max. 20 per apel, care incrementează `searches`.

### Existente (quiz, faza 2)

- `subscribers`: abonarea la newsletter (comună 23ai + 23citybreak). `newsletter` bool, `consent_text`, `consent_at`, `unsubscribed_at`.
- `quiz_scores`: scorurile quizului. Clasamentul doar prin `rpc('my_quiz_rank', {p_quiz: 'ghiceste-orasul'})`.

## RPC

| Funcție | Cine | Ce face |
|---|---|---|
| `my_quiz_rank(p_quiz)` | authenticated | cel mai bun scor, locul, numărul de jucători, top % |
| `unsubscribe(p_token)` | anon | dezabonare din linkul din email |
| `delete_my_account()` | authenticated | șterge contul și toate datele |
| `record_search(p_city_ids text[])` | authenticated | înregistrează orașele căutate (max. 20) |

## `window.Account` (din `assets/account.js`)

| Metodă | Rezultat |
|---|---|
| `Account.client()` | Promise cu clientul Supabase (sesiune persistentă) |
| `Account.session()` | Promise cu sesiunea sau `null` |
| `Account.hasSession()` | bool sincron (după tokenul din localStorage) |
| `Account.preferences()` | Promise cu rândul din `search_preferences` sau valorile implicite |
| `Account.openLogin()` | deschide fereastra de login (magic link) |
| evenimentul `account:change` pe `window` | la login / logout / salvarea preferințelor |

## Punct de montare pentru harta orașelor văzute

Onboardingul (pasul 2) și pagina de profil (`cont.html`) apelează, dacă există:

```js
window.VisitedCities.mount(container, {client, user, mode: 'onboarding' | 'profile'})
```

Dacă `window.VisitedCities` nu e încărcat, se afișează un placeholder. Scriptul hărții se include în `cont.html` înainte de `assets/account.js`.

### `events` (evenimente la dată fixă: concerte, meciuri, festivaluri)

Cache public, **doar citire** din browser (`anon` și `authenticated`). Scrie doar funcția `supabase/functions/events-sync` (zilnic, service role).

| Coloană | Tip | Note |
|---|---|---|
| `id` | text PK | `tm:<id>` Ticketmaster, `fd:<id>` football-data.org, `cur:<slug>` lista curatoriată |
| `kind` | text | `concert`, `football`, `sport`, `festival`, `market`, `city_festival`, `theatre`, `comedy`, `other` |
| `title`, `venue` | text | |
| `city_id` | text | slug Kiwi fără `City:`, ca în `visited_cities` |
| `starts_at`, `ends_at` | timestamptz | `ends_at` doar la evenimente pe mai multe zile |
| `time_tbc` | boolean | ora nu e anunțată; afișează doar data |
| `artists`, `teams`, `genres` | text[] | `teams` = [gazde, oaspeți] |
| `competition` | text | cod football-data.org (`CL`, `PL`, `PD`, `SA`, `BL1`, `FL1`, `DED`, `PPL`) |
| `price_min_eur` | numeric | doar dacă sursa dă preț în EUR |
| `ticket_url`, `image_url` | text | doar `https://`; la fotbal `ticket_url` e `null` (link spre site-ul clubului, de adăugat în UI) |
| `popularity` | int 0–100 | scor intern de ordonare |
| `source` | text | `ticketmaster`, `football-data`, `curated` |

```js
const sb = await Account.client();
const {data} = await sb.from('events').select('*').eq('city_id', 'vienna_at')
  .gte('starts_at', '2027-06-11').lte('starts_at', '2027-06-14').order('popularity', {ascending: false});
```

### `event_preferences` (ce evenimente îl interesează pe utilizator)

Un rând per cont, privat (RLS ca la `search_preferences`). Rândul **poate lipsi**. Editat din cardul „Ce te aduce într-un oraș?” din profil (`assets/profile-interests.js`).

| Coloană | Tip | Note |
|---|---|---|
| `user_id` | uuid PK → auth.users | |
| `music_genres` | text[] | `rock`, `pop`, `electronic`, `hiphop`, `metal`, `indie`, `jazz`, `classical`, `latin`, `folk` |
| `sports` | text[] | `football`, `basketball`, `tennis`, `f1`, `motogp`, `running` |
| `competitions` | text[] | coduri football-data.org: `CL`, `PL`, `PD`, `SA`, `BL1`, `FL1`, `DED`, `PPL` (ca `events.competition`) |
| `other_interests` | text[] | `festival`, `xmas_market`, `city_festival`, `theatre`, `comedy` |
| `favorite_teams`, `favorite_artists` | text[] | nume introduse liber, cel mult 20 / 30 |
| `event_alerts` | boolean | acord pentru emailuri cu evenimentele favorite; default `false` |
| `updated_at` | timestamptz | prin trigger |

După salvare, aceleași valori sunt copiate în `localStorage['23cb-event-prefs']`, pentru filtrarea evenimentelor fără o cerere în plus.

## Căutare de evenimente (20261112_events_search.sql)

- `events.search_text`: coloană generată (titlu, sală, artiști, echipe, numele competiției, orașul), normalizată cu `ev_norm` (fără diacritice), index GIN trigram.
- `search_events(q, city_ids, lim)`: RPC public, fiecare cuvânt trebuie să apară exact sau aproximativ (`word_similarity ≥ 0.5`).
- `event_search_cache`: căutările trimise deja la Ticketmaster de funcția `events-search`; fără acces public.
- `event_alerts`: „Anunță-mă pe email când apare”; fiecare utilizator își vede, adaugă și șterge doar alertele lui; max. 30 active.
