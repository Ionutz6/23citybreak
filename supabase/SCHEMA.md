# Schema Supabase „23ai” (cont, profil, preferințe, orașe văzute)

Proiect: **23ai** (ref `lsudthnrumslfscpppix`, EU Frankfurt). Baza aparține 23ai; 23citybreak doar scrie în ea.
Clientul din browser: `assets/account.js` expune `window.Account` (vezi mai jos). Nu crea alt client Supabase.

Migrații: `supabase/migrations/20261111_quiz.sql`, `20261111_quiz_cards.sql`, `20261111_profil.sql`.

## Reguli comune

- Toate tabelele au **RLS**: un utilizator conectat (`authenticated`) vede și modifică **doar rândurile lui** (`user_id = auth.uid()`).
- `anon` nu are acces la niciun tabel. Nu există nimic public (profilul e privat).
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
| `temp_min_c`, `temp_max_c` | int −30…45 | interval de temperatură dorit la destinație; `null` = oricare |
| `city_mode` | `'new'` \| `'any'` | default pentru întrebarea „oraș nou sau oricare?” la căutare |
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
