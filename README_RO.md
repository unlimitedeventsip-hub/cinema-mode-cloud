# ◈ CINEMA MODE CLOUD — GitHub + Supabase + Cloudflare Pages + R2

Versiune pregătită pentru deployment. **Modul USB/local funcționează fără Supabase, fără cont și fără conexiune internet după încărcarea paginii în browser.** Oferă UI premium, cont privat, catalog, upload multipart pentru filme de dimensiuni mari, streaming video original cu `HTTP Range`, subtitrări SRT/VTT (sincronizare și mărime), proiector prin browser, telecomandă prin Supabase Realtime (cu fallback polling), și redare locală pe laptop + HDMI. Filmele pot fi proiectate doar dacă ai drepturile corespunzătoare.

**ARHITECTURĂ**

```
GitHub (sursă)
   └── Cloudflare Pages (site HTTPS + Pages Functions)
          ├── Supabase Auth + Postgres (utilizatori, titluri, subtitrări, comenzi și stare)
          └── Cloudflare R2 (fișierele video mari, private)
Laptop → browser Cinema Mode → upload multipart către Pages Functions → R2
Proiector → browser Cinema Mode → bilet semnat de durată scurtă → stream R2 prin Pages Function
```

**Important:** site-ul NU folosește GitHub pentru filme. Cloudflare nu a fost conectat automat; este necesar deployment din contul tău Cloudflare. Testarea completă a build-ului Vite nu a fost posibilă aici deoarece registry-ul npm nu a putut fi accesat, dar codul JavaScript a trecut verificarea sintaxei. Supabase este baza de date, nu soluția implicită de găzduire a filmelor. R2 poate necesita activarea plăților și are limite/costuri proprii. Streamingul pe internet poate consuma mult trafic; verifică dashboard-urile de consum. Fișierele MKV/AVI/HEVC pot să nu poată fi redate de browserul proiectorului — recomandat MP4 H.264 video + AAC audio. Se transmite fișierul *original*, fără a pretinde că o sursă de 1080p devine 4K. Acer PD1520s este Full HD nativ. Browserul nu poate modifica calitatea dacă nu există versiuni alternative ale filmului.

## 1. Creează repository pe GitHub

Creează repository nou **`cinema-mode-cloud`** în contul `unlimitedeventsip-hub` pe GitHub (ideal privat), fără README inițial. Conectorul GitHub disponibil nu poate crea repo-uri noi, așa că acest pas se face din interfața GitHub. Restul fișierelor sunt în arhiva proiectului. Deschide terminalul în folderul acestui proiect și execută:

```powershell
git init
git add .
git commit -m "Initial Cinema Mode Cloud"
git branch -M main
git remote add origin https://github.com/UTILIZATORUL-TAU/cinema-mode-cloud.git
git push -u origin main
```

Înlocuiește `UTILIZATORUL-TAU` cu numele real al contului GitHub. Nu urca filme sau chei secrete în GitHub. Proiectul conține `.gitignore` pentru secrete și build.

## 2. Creează proiect în Supabase

1. Cinema Mode a fost configurat în proiectul Supabase EXISTENT `screen`, ID `asixkabhesmhbqunxqby` (https://supabase.com/dashboard/project/asixkabhesmhbqunxqby). Nu este nevoie de proiect nou sau cost suplimentar pentru o nouă bază de date.
2. Schema a fost deja aplicată în acest proiect. Tabelele `cinema_films`, `cinema_commands` și `cinema_state` au RLS. Fișierul `supabase/schema.sql` rămâne pentru reproducere.
3. În **Authentication -> Providers -> Email** verifică autentificarea email. După creare poți lăsa confirmarea emailului activă (recomandat) și să te înregistrezi din aplicație.
4. În **Project settings / API** copiează **Project URL** și **publishable key** (`sb_publishable_...`) sau cheia `anon` existentă. Nu folosi `service_role` în frontend.

## 3. Configurează Cloudflare R2

1. În https://dash.cloudflare.com/ intră la **R2 Object Storage** și creează bucketul `cinema-films`.
2. Bucket-ul trebuie să rămână **privat**. NU activa public access.
3. Accesează Workers & Pages -> Create application -> Pages -> Connect to Git și selectează repository-ul nou.
4. Setări build: **Build command** `npm run build`; **Build output directory** `dist`; Root directory `/`. Instalează Node.js ca runtime dacă este cerut; Cloudflare se ocupă de build.
5. În proiectul Pages, **Settings -> Bindings -> Add -> R2 bucket**, variable name **`CINEMA_BUCKET`**, bucket `cinema-films`.
6. În **Settings -> Variables and Secrets**, configurează (Production, apoi Preview dacă vrei):

| Nume | Valoare | Tip |
|---|---|---|
| `VITE_SUPABASE_URL` | URL-ul proiectului | variabilă (publică, necesară la build) |
| `VITE_SUPABASE_ANON_KEY` | cheia publică Supabase | variabilă (publică, necesară la build) |
| `SUPABASE_URL` | același URL | variabilă |
| `SUPABASE_ANON_KEY` | aceeași cheie publică | variabilă |
| `TICKET_SECRET` | șir aleator de minimum 32 caractere | **Secret** (nu îl publica) |

7. **Save and Deploy / Redeploy**. După configurarea R2 binding, trebuie declanșat încă un deployment pentru a-l aplica.
8. Adresa este de forma `https://cinema-mode-cloud.pages.dev` (numele real depinde de proiectul Cloudflare).
9. În Supabase **Authentication -> URL Configuration** setează Site URL la adresa reală Pages și adaugă redirect-urile potrivite pentru email confirmation.

## 4. Utilizare

- **Stick USB / local:** conectează stickul USB la laptop sau la proiector; deschide site-ul și apasă **Deschide cinema de pe stick USB / laptop** (fără cont), apoi **Film de pe USB / laptop**. Browserul va afișa selectorul de fișiere al dispozitivului; alege video și, din player, **Importă .srt / .vtt**. Browserele Android pot să nu ofere acces la stick prin selectorul de fișiere; în acest caz folosește HDMI, aplicație locală sau un player Android. Filmul rămâne pe USB și nu este încărcat online.
- **Laptop:** deschide site-ul HTTPS în browser; înregistrează-te/ intră în cont și adaugă filme MP4 (upload R2). Poți încărca și SRT/VTT și poți da o adresă HTTPS către poster; pentru MP4 browserul încearcă generarea automată a unui thumbnail.
- **Proiector:** pe browserul său deschide `https://ADRESA-PAGES.pages.dev/screen` și intră în **același cont**, selectează fullscreen o dată. Browserul poate cere o apăsare manuală pe ▶ din motive de autoplay.
- **Laptop sau telefon:** deschide `/remote` și conectează-te în același cont; selectează filmul și controlează pauza/derularea.
- **HDMI:** dacă proiectorul nu redă bine browserul, conectează laptopul la proiector prin HDMI; deschide `/screen`, selectează filmul și apasă fullscreen. Butonul **Redă local · HDMI** poate reda fișiere locale fără upload, dar fișierul local nu poate fi transmis către browserul altui dispozitiv.
- **Subtitrări:** pentru USB importă SRT/VTT direct din player (maxim 1 MB); pentru cloud poți include un SRT/VTT (maxim 350 KB) la încărcare; alegi subtitrarea, offset -30...+30 s și mărimea. Subtitrările sunt afișate în overlay (nu sunt încorporate în film).

## 5. Dezvoltare locală

```bash
npm install
cp .env.example .env
# completează VITE_SUPABASE_URL și VITE_SUPABASE_ANON_KEY în .env
npm run dev
```

`vite dev` testează UI și Supabase, dar **NU rulează automat Pages Functions/R2 binding**. Pentru test complet se poate folosi `wrangler pages dev dist --r2 CINEMA_BUCKET=cinema-films` cu configurarea locală a variabilelor/secrets sau un deployment de test în Cloudflare. Nu introduce cheile în repo.

## 6. Observații, limitări și securitate

- Accesul la fișiere necesită autentificare Supabase, iar URL-urile de redare sunt semnate și expiră după aproximativ 4 ore. Un URL temporar poate fi folosit de cine îl obține înainte să expire; nu îl distribui.
- RLS restricționează catalogul, comenzi și starea la proprietarul contului; fișierele R2 sunt izolate prin prefix UID.
- Pentru comoditate, utilizatorul trebuie să se autentifice în **același cont pe laptop și proiector**. Pairing QR/PIN fără login pe proiector și biblioteci multi-cont sunt îmbunătățiri ulterioare.
- **Upload multipart** folosește 12 MiB pe request pentru a evita limitele mari per-request. Filmul nu este transcodat în cloud. Dacă upload-ul se întrerupe, această versiune nu reia automat upload-ul de la partea anterioară.
- Dacă încărcarea se finalizează în R2 dar inserarea metadatelor eșuează, poate rămâne un fișier orfan ce trebuie șters din R2 dashboard.
- USB-ul este vizibil în selector doar dacă browserul și sistemul dispozitivului permit accesul; un website nu poate detecta automat toate stickurile sau folosi toate codecurile MKV/HEVC.
- Nu include DRM, descărcare de filme de pe platforme terțe sau facilități de proiecție publică fără licență. Pentru proiecții publice este necesară licențierea adecvată a conținutului.
- Pentru transmisiuni la locații pe internet, conexiunea la server și calitatea Wi-Fi influențează stabilitatea. HDMI rămâne cea mai robustă opțiune.
- Ștergerea filmelor și editarea metadatelor pot fi extinse într-o versiune ulterioară. În această versiune v1 filmele pot fi adăugate și redate.

## Structură

```
index.html           UI
src/main.js          logică browser, Supabase, player, telecomandă, upload
src/style.css        design responsive
functions/api/*      upload multipart, ticket semnat, streaming Range, ștergere R2
functions/_lib/*     autentificare JWT prin Supabase Auth și validare
supabase/schema.sql  SQL + RLS + Realtime
public/_headers      headers securitate
public/_redirects    /screen și /remote
```
