# Cinema Mode — aplicație Android pentru proiector

Interfața nativă Android (WebView) deschide direct `https://cinema-mode-cloud.unlimited-events-ip.workers.dev/?mode=projector`, în landscape și fără bare de navigare. Folosește selectorul de fișiere Android pentru stick USB/subtitrare dacă Android și browserul WebView acceptă formatul. Asocierea securizată este implementată de site și persistă în stocarea locală WebView.

## APK (build prin GitHub Actions)

Intră în repository -> **Actions -> Build Cinema Mode Projector APK**, apasă **Run workflow**, apoi descarcă artifact-ul `cinema-mode-projector-debug-apk` din rularea reușită. APK-ul de debug este pentru uz personal/test, nu semnat pentru distribuire publică prin Play Store.

Alternativ, deschide folderul `android-projector-app` în Android Studio, cu JDK 17, SDK 35, AGP 8.8.2 și Gradle 8.10.2 și compilează `assembleDebug`.

## Utilizare

1. Instalează APK-ul pe proiectorul Android, apoi deschide Cinema Mode.
2. Pe ecran apare un cod temporar de 8 caractere.
3. Pe laptop, autentifică-te pe site -> **Telecomandă -> Asociază un proiector**.
4. Introdu codul și aprobă. Proiectorul va fi autorizat fără email/parolă.
5. La următoarea deschidere a aplicației va fi recunoscut automat.
6. Pentru dezactivare, revocă dispozitivul din lista **Proiectoarele mele**.

**În Cloudflare Worker** configurează ca Secret `SUPABASE_SERVER_KEY` din proiectul Supabase `screen`. Nu pune niciodată cheia în GitHub sau în APK. Tabelul `cinema_devices` trebuie să fie instalat și să aibă RLS activ.

## Limitări

Aplicația folosește motorul Android WebView pentru streaming, nu VLC/ExoPlayer. Nu garantează redarea MKV/HEVC/codec DTS la rezoluție 4K; depinde de firmware/codecuri. MP4 H.264/AAC este recomandat pentru compatibilitate. Proiectorul afișează imagine la rezoluția sa nativă, indiferent de rezoluția sursei.

Acesta este **codul-sursă Android**, iar APK-ul poate fi obținut numai dacă buildul GitHub Actions reușește. Instalează numai fișiere APK provenite din propriul repository.
