# Login cu Google (buton + fereastra One Tap)

Butonul „Continuă cu Google” și fereastra One Tap („Continuă ca …”) folosesc Google Identity Services direct pe
23citybreak.ro: Google scrie „Conectează-te la 23citybreak.ro”, fără să treacă prin pagina proiectului Supabase
(nu se folosește redirectul OAuth, deci adresa `lsud….supabase.co` nu apare). Pornesc amândouă când
`GOOGLE_CLIENT_ID` din `assets/account.js` e completat și providerul Google e activ în Supabase.

## 1. Google Cloud: clientul OAuth (≈10 minute)

1. Deschide <https://console.cloud.google.com/> și creează un proiect, de ex. **23citybreak**.
2. **APIs & Services → OAuth consent screen** (sau „Google Auth Platform → Branding”):
   - User type: **External**; App name: **23citybreak**; support email: adresa ta; logo: `favicon.png` (opțional).
   - Authorized domains: `23citybreak.ro` și `supabase.co`.
   - Scopes: doar `openid`, `email`, `profile` (implicite, nu cer verificare).
   - La final apasă **Publish app** („In production”), altfel doar conturile de test pot intra.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**, nume: `23citybreak web`.
   - **Authorized JavaScript origins**: `https://23citybreak.ro` (și `https://www.23citybreak.ro` dacă îl folosești).
   - **Authorized redirect URIs**: `https://lsudthnrumslfscpppix.supabase.co/auth/v1/callback`
   - Create → copiază **Client ID** și **Client secret**.

## 2. Supabase: providerul Google

1. <https://supabase.com/dashboard/project/lsudthnrumslfscpppix/auth/providers> → **Google** → Enable.
2. **Client IDs**: Client ID-ul de mai sus. **Client Secret**: secretul. Save.
3. **Authentication → URL Configuration**: lista de Redirect URLs trebuie să conțină deja `https://23citybreak.ro/**`.

## 3. Client ID-ul în site

În `assets/account.js` pune Client ID-ul (nu secretul!) în `const GOOGLE_CLIENT_ID = '…';` și publică.
- Butonul apare în Contul tău și în ferestrele de login (PDF, quiz, newsletter).
- One Tap apare vizitatorilor neconectați după 5 secunde, cel mult o dată la 7 zile, nu și pe pagina de cont.
- Login-ul se face cu `supabase.auth.signInWithIdToken` (cu nonce), deci contul e același ca la magic link
  dacă emailul e același.
- „Authorized JavaScript origins” (pasul 1) e obligatoriu: fără `https://23citybreak.ro` acolo, butonul nu se afișează.
- Authorized domains (Branding, jos): `23citybreak.ro` și `supabase.co`.

## Ce nu se schimbă

- Magic linkul rămâne. Newsletterul nu se bifează automat la Google: se abonează doar cine bifează sau apasă
  „Abonează-mă” în cont.
- Ștergerea contului șterge și conturile create cu Google.
