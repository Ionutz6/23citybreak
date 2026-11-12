# Login cu Google (buton + fereastra One Tap)

Codul e gata: butonul „Continuă cu Google” apare automat în Contul tău și în ferestrele de login imediat ce
providerul Google e activ în Supabase. Fereastra One Tap („Continuă ca …”) pornește după ce pui Client ID-ul în
`assets/account.js` (`GOOGLE_CLIENT_ID`).

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

După pasul 2, butonul „Continuă cu Google” apare singur pe site (fără deploy).

## 3. One Tap

În `assets/account.js` pune Client ID-ul (nu secretul!) în `const GOOGLE_CLIENT_ID = '…';` și publică.
Fereastra apare vizitatorilor neconectați după 5 secunde, cel mult o dată la 7 zile, nu și pe pagina de cont.
Login-ul se face cu `supabase.auth.signInWithIdToken` (cu nonce), deci contul e același ca la magic link
dacă emailul e același.

## Ce nu se schimbă

- Magic linkul rămâne. Newsletterul nu se bifează automat la Google: se abonează doar cine bifează sau apasă
  „Abonează-mă” în cont.
- Ștergerea contului șterge și conturile create cu Google.
