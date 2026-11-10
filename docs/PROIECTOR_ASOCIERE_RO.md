# Asociere Cinema Mode pe proiector (fără parolă)

## Ce este deja pregătit
- GitHub: interfața nouă, API-ul securizat de pairing, schema și aplicația Android.
- Supabase: tabelul `public.cinema_devices` creat în proiectul `screen` (`asixkabhesmhbqunxqby`), RLS activ, fără privilegii anon/auth pentru această tabelă.
- Cloudflare Worker: rută nouă `/api/device/*`, cod temporar de 8 caractere, aprobare din contul laptopului, token dispozitiv random de 256 biți stocat local și verificat numai ca SHA-256 în DB.

## Cloudflare: secret obligatoriu pentru pairing

În `Workers & Pages → cinema-mode-cloud → Settings → Variables and Secrets → Runtime variables and secrets (Production)` adaugă:

**Name:** `SUPABASE_SERVER_KEY`  
**Type:** `Secret` (nu Text)  
**Value:** cheia `sb_secret_...` din **Supabase → proiectul screen → Settings → API Keys → Secret keys**.

Folosește o cheie nouă creată special pentru acest Worker. Trebuie să fie cheia proiectului **screen**, nu a proiectului Unlimited Events. **Nu o trimite în chat, nu o pune în GitHub, în `.env` public sau în APK.** Cheile secret pot ocoli RLS; sunt folosite aici doar în Worker după verificarea contului sau a tokenului dispozitivului.

Păstrează și celelalte configurații de runtime: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `TICKET_SECRET`, binding R2 `CINEMA_BUCKET` → `cinema-films`. Variabilele VITE_* sunt doar la build.

După setare apasă **Deploy**. Verifică `https://cinema-mode-cloud.unlimited-events-ip.workers.dev/api/health`; trebuie să apară și `"devicePairing":true`.

## Cum asociezi (o singură dată)

1. Pe proiector, pornește aplicația Android Cinema Mode (sau intră din browser la `https://cinema-mode-cloud.unlimited-events-ip.workers.dev/?mode=projector`).
2. Ecranul afișează un **cod temporar de 8 caractere**, valabil 10 minute.
3. Pe laptop te autentifici la Cinema Mode, deschizi **Telecomandă → Asociază un proiector**, introduci codul și apeși **Aprobă proiectorul**.
4. Proiectorul verifică automat aprobarea și deschide modul Cinema. Nu introduci parola pe proiector.
5. Laptopul poate trimite filme către ecranul asociat, controla redarea și revoca oricând accesul din lista **Proiectoarele mele**.
6. La următoarea deschidere, aplicația folosește tokenul asociat deja salvat în datele aplicației; dacă ștergi datele aplicației sau revoci dispozitivul, e nevoie de un cod nou.

## Securitate și limite

- Codul este consumat la aprobare, expiră în 10 minute și nu reprezintă un token permanent.
- Proiectorul nu stochează parola contului și nici cheile Supabase.
- Baza stochează numai **hashuri** pentru tokenul dispozitivului și pentru codul de pairing.
- Fiecare comandă de redare este limitată la proprietarul dispozitivului; URL-urile temporare de streaming expiră.
- Un dispozitiv compromis poate folosi temporar propriul său token până la revocare; revocă-l din laptop și șterge datele aplicației dacă îl pierzi.
- Pentru un serviciu expus public, configurează și reguli Cloudflare WAF / rate limiting pentru `/api/device/start` și `/api/device/approve`; această versiune nu include protecție automată completă împotriva abuzului de cereri.
- Browserele Android/WebView pot refuza redarea unor formate MKV/HEVC; pentru compatibilitate folosește MP4 H.264/AAC.
- Este doar pentru conținut pentru care deții drepturile de redare/proiecție.

## APK

GitHub Actions → **Build Cinema Mode Projector APK** → rulare reușită → artifact `cinema-mode-projector-debug-apk`. Până apare un build verde, folosește varianta browser/PWA. APK-ul de test poate fi instalat prin ADB; nu a fost încă verificat pe hardware-ul Acer.
