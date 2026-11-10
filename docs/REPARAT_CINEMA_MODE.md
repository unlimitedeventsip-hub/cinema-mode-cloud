# Cinema Mode — fix complet verificabil

Actualizat pentru Cloudflare **Workers** (nu Pages), Supabase `screen` și bucket R2 privat `cinema-films`.

## Reparat în GitHub
- `wrangler.jsonc`: binding `CINEMA_BUCKET`, URL-ul Supabase și cheia **publishable** necesare **la runtime**. Nu mai este obligatoriu să copiezi cele două valori publice în secțiunea Runtime din Dashboard.
- `src/worker.js`: router `/api/upload/*`, `/api/device/*`, `/api/play`, `/api/ticket`, `/api/health`.
- UI proiector: când generarea codului eșuează, eroarea rămâne afișată și poți reîncerca. URL-ul rămâne `?mode=projector` după asociere, astfel încât proiectorul nu revine la ecranul de login când reîncarci pagina.
- UI administrator: status API real; arată ce configurație lipsește.
- Teste automate: autorizare upload, generare/asociere/revocare proiector cu server Supabase simulat, build Vite și pachet Worker.

## Cele DOUĂ secrete care trebuie introduse în Cloudflare

În `Workers & Pages → cinema-mode-cloud → Settings → Variables and Secrets → Runtime variables and secrets → Production`:

| Name | Type | Value |
| --- | --- | --- |
| `SUPABASE_SERVER_KEY` | **Secret** | Cheia **sb_secret_...** a proiectului Supabase **screen** (`asixkabhesmhbqunxqby`). Creează una special pentru Cinema Mode, dacă ai posibilitatea. |
| `TICKET_SECRET` | **Secret** | 64 caractere hex aleatorii (32 bytes). Generează separat; nu folosi cheia Supabase. |

Cheile sunt confidențiale: **nu le trimite în chat, nu le urca pe GitHub și nu le pune în `wrangler.jsonc`.**

Dacă nu ai `TICKET_SECRET`, generează în PowerShell:

```powershell
$b = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
[BitConverter]::ToString($b).Replace('-', '')
```

**Important**: variabilele din **Settings → Builds** sunt disponibile când rulează Vite, dar nu înseamnă că sunt automat și variabile pentru Worker în execuție. Cheile publice `SUPABASE_URL` și `SUPABASE_ANON_KEY` sunt acum definite direct în Wrangler și vor fi disponibile în Worker după deploy. Cheia secretă și secretul de semnare trebuie totuși configurate manual la **Runtime**, apoi **Deploy**.

## Pașii Cloudflare

1. Verifică `CINEMA_BUCKET` → `cinema-films` în `Settings → Bindings`. Bucketul trebuie să fie privat.
2. Introdu cele două **secrete de runtime** și apasă **Deploy**.
3. Verifică faptul că noul commit GitHub s-a publicat cu succes în `Deployments`, nu doar în `GitHub Actions`. Cloudflare Workers Builds trebuie să utilizeze `npm run build` și `npx wrangler deploy`.
4. Deschide `https://cinema-mode-cloud.unlimited-events-ip.workers.dev/api/health`. Toate cele patru câmpuri trebuie să fie `true`: `storage`, `authConfig`, `ticketSecret`, `devicePairing`.
5. Testează întâi upload-ul unui MP4 mic; apoi folosește fișierele de 4-6 GB. MKV/HEVC nu este garantat în Android WebView/browser chiar dacă fișierul este încărcat în R2.

## Asociază proiectorul fără login

1. Pe Acer, deschide APK-ul sau `https://cinema-mode-cloud.unlimited-events-ip.workers.dev/?mode=projector`.
2. După ce API-ul este configurat, pe ecran apare codul temporar cu 8 caractere.
3. Pe laptop, intră în cont, apoi `Telecomandă → Asociază un proiector` și aprobă codul.
4. Asociarea persistă local până ștergi datele aplicației sau revoci accesul.
5. Dacă vezi un mesaj roșu, **citește eroarea exactă de pe ecran**; acum este permanentă, nu dispare după câteva secunde.

## Diagnostic rapid

- `authConfig: false`: Cloudflare servește o versiune veche sau lipsesc valorile runtime publice (verifică deploymentul și `wrangler.jsonc`).
- `storage: false`: lipsește bindingul `CINEMA_BUCKET`.
- `ticketSecret: false`: lipsește `TICKET_SECRET` la Runtime.
- `devicePairing: false`: lipsește `SUPABASE_SERVER_KEY` la Runtime.
- `/api/health` răspunde 404: Workerul nou nu a fost deployat.
- Nu apar filmele pe ecranul proiectorului: verifică întâi că există asociere și un film în biblioteca Supabase; folosește un MP4 H.264/AAC de test, nu MKV/x265.

## Limite importante

Testele CI sunt **simulate**; nu confirmă credențialele reale din Cloudflare. Până la `ready: true` în Cloudflare și un test fizic, nu considera redarea pe Acer complet validată.

Păstrează `SUPABASE_SERVER_KEY` doar în Cloudflare Worker. O cheie secretă poate ocoli RLS; nici browserul, nici APK-ul, nici GitHub nu trebuie să o conțină.
