# Publisere en versjon

Engangsoppsett: lag API-nøkler på [addons.mozilla.org](https://addons.mozilla.org/developers/addon/api/key/) og legg dem inn som repo-hemmelighetene `AMO_JWT_ISSUER` og `AMO_JWT_SECRET` (Settings → Secrets and variables → Actions).

1. Øk `version` i `manifest.json`, og commit og push.
2. Opprett og push en tagg som matcher manifestversjonen:

   ```sh
   git tag v1.0.10
   git push origin v1.0.10
   ```

Release-workflowen kjører testene og `web-ext lint`, signerer utvidelsen hos Mozilla (unlisted, ikke synlig på addons.mozilla.org), publiserer en GitHub Release med `reddit-autoscroll-1.0.10.xpi` og automatisk genererte versjonsnotater, og legger versjonen inn i `updates.json` på `main`. Firefox leser `updates.json` via `update_url` i manifestet, så installerte kopier oppdateres automatisk.

Du kan også velge **Actions → Release → Run workflow**, velge branch og la taggfeltet stå tomt. Workflowen bruker versjonen i `manifest.json` og oppretter taggen fra valgt commit hvis den ikke finnes. En eksisterende tagg må peke på samme commit. Oppgi en eksisterende tagg i feltet hvis du vil publisere akkurat den versjonen. Release må ikke allerede finnes, og Mozilla godtar hver versjon bare én gang.
