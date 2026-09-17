# Scroll uten fokus

Firefox-utvidelse som scroller en valgt fane uten å ta mus- eller tastaturfokus.

## Installer lokalt

1. Åpne `about:debugging#/runtime/this-firefox` i Firefox.
2. Velg **Last inn midlertidig tillegg** og åpne `manifest.json` i denne mappen.
3. Åpne en vanlig nettside, klikk utvidelsesikonet og trykk **Start / oppdater**.
4. Bytt fane eller bruk et annet program. Utvidelsen fortsetter så lenge Firefox kjører og siden er lastet.

En midlertidig installasjon fjernes når Firefox avsluttes. ZIP-filen i `dist` er kildepakken for signering hos Mozilla; vanlig Firefox krever signering for permanent installasjon.

## Oppførsel

- En kontrollinje �verst p� siden viser status mens �kten kj�rer. Pause/Fortsett og Stopp styrer denne fanen. �Skip wait� hopper over den aktive videoen eller bildekarusellen for resten av �kten; nye medier ventes fortsatt p�. Linjen blir v�rende p� pause og fjernes ved stopp.
- Hastighet: 1–2000 piksler per sekund; oppover eller nedover.
- Videohastighet kan settes til 1–100 % av normal hastighet i popupen; standard er 25 %. For eksempel gir 80 piksler/sekund og 50 % videohastighet 40 piksler/sekund ved video. Trykk «Start / oppdater» for å bruke og lagre innstillingen. Stoppen med sikkerhetsmargin gjelder ved alle videohastigheter.
- Alt+Shift+S starter eller pauser den valgte fanen. Snarveien gjelder inne i Firefox.
- Flere faner kan startes separat. Popupen viser status for den valgte fanen.
- Synlige sider scroller med `requestAnimationFrame`, synkronisert med skjermoppdateringene, også når et annet program har fokus. Lange animasjonsforsinkelser begrenses til 50 ms for å unngå hopp.
- I skjulte faner sender bakgrunnsskriptet scrollsignaler hvert 250 ms. Forsinkelser gir maksimalt to sekunders scrollavstand per signal. Synlige sider bruker signalene som livstegn, uten ekstra scrollsteg.
- «Fortsett i skjulte faner» kan slås av. Manglende vindusfokus alene pauser ikke scrolling.
- Navigasjon, lukking av fanen og omstart stopper økten. Hastighetsinnstillingene lagres.
- Ved bunnen/toppen venter utvidelsen 15 sekunder på nytt innhold før den stopper.
- Hele siden prioriteres; ellers velges det største synlige scrollbare feltet.
- Reddit-bildekaruseller (`gallery-carousel`) bytter automatisk til neste bilde når hele karusellen er synlig i scrollfeltet (to pikslers toleranse). «Vent på bilder» er et eget valg, på som standard. Slås det av, scroller siden med normal hastighet uten å vente på karusellen; automatisk bildebytte kan fortsatt være på. Popupen lar deg slå automatisk bildebytte av/på, velge scrollhastighet på 1–100 % og visningstid på 0,5–60 sekunder per bilde. Standard er på, 25 % hastighet og tre sekunder per bilde. Innstillingene lagres når du trykker «Start / oppdater». Først hvis karusellen når kanten av scrollfeltet før bildene er ferdig vist, pauses scrolling. Etter siste bilde gjenopprettes normal hastighet. Reddits egne neste-knapper brukes, også i åpne shadow DOM-trær. En karusell vises én gang per scrolløkt. Hvis knappen ikke virker, karusellen fjernes eller den forlater bildet, slippes ventingen; maksimal ventetid er minst to minutter og utvides for karuseller med lengre samlet visningstid. Dette fungerer uavhengig av «Vent på videoer».
- «Vent på videoer» er på som standard. Nye HTML-videoer oppdages også i åpne shadow DOM-trær. Normal hastighet beholdes frem til hele videoen er i bildet (med to pikslers toleranse). Deretter scroller siden med 25 % hastighet. Er videoen fortsatt ikke ferdig, pauses scrolling med 64 pikslers sikkerhetsmargin til kanten av scrollfeltet. Ferdige videoer gjenoppretter normal hastighet med en gang. Videoer større enn scrollfeltet pauses når de fyller den tilgjengelige synlige flaten. Redgifs-iframe rapporterer avspilling og videogeometri hvert 50 ms; den ytre scrollmotoren måler spillerens plassering ved hver animasjonsoppdatering og begrenser scrollavstanden direkte. Spillere som ikke kan knyttes sikkert til en iframe, får maksimalt fire piksler langsom scrolling før venting. Popupen viser avspillingstid og om scrolling går sakte eller venter.
- Reddit-videoer og GIF-er i `shreddit-player` uten autoplay startes lydløst når hele videoen er i bildet og «Vent på videoer» er på. De bruker samme hastighet, sikkerhetsmargin og venting som andre videoer. Dette krever at spillerens HTML-video er tilgjengelig, også gjennom åpne shadow DOM-trær.
- Videoer som looper slippes etter én runde. Ventingen avsluttes også ved feil, fjerning, fem sekunder med pauset avspilling, 15 sekunder uten fremdrift eller maksimalt to minutter per video. Hvis nettleseren blokkerer avspilling, fortsetter scrolling etter tidsavbruddet.
- En ferdig eller tidsavbrutt video ventes ikke på igjen før en ny scrolløkt startes eller videokilden endres. Innebygde Redgifs-spillere støttes med et eget innholdsskript i spillerens iframe. Det rapporterer avspilling og faktisk synlighet til scrollmotoren. Dette krever nettstedstillatelse for `redgifs.com` og underdomener. Blob-videoer støttes uten tilgang til selve videofilen. Andre iframe-spillere og lukket shadow DOM støttes ikke.
- Interne Firefox-sider, Mozilla Add-ons og andre beskyttede sider tillater ikke innholdsskript.

Firefox og operativsystemet kan begrense kjøring når vinduet er minimert eller fanen er skjult. Sider kan også stoppe innlasting av nytt innhold når de er skjult. Jevn bakgrunnsanimering, scrolling i utlastede faner og kjøring under dvale kan ikke garanteres. Manifest V2 brukes for en vedvarende Firefox-bakgrunnsside; utvidelsen er ikke laget for Chrome.

## Verifisering

Kjør `node --test tests/*.test.cjs`. Testene simulerer nettleser-API og scrollfelt; de erstatter ikke testing i Firefox.

Manuell test i Firefox: start på en lang side, bytt fane i 30 sekunder og kontroller endret scrollposisjon. Gjenta med et annet program i fokus og med minimert Firefox. Prøv pause, fortsett, stopp, navigasjon og en Reddit-feed med innlasting av nye innlegg. Kontroller også et scrollbart felt og en beskyttet side. For video: bekreft at en ny autoplay-video holdes i bildet, at popupen viser fremdrift, at scrolling fortsetter ved slutt, og at «Vent på videoer» kan slås av. Prøv også en loop og blokkert autoplay.
