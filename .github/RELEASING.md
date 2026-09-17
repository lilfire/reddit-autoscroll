# Publisere en versjon

1. Oppdater `version` i `manifest.json`, og commit og push endringene sammen med release-workflowen.
2. Opprett og push en tagg som matcher manifestversjonen:

   ```sh
   git tag v1.0.7
   git push origin v1.0.7
   ```

Release-workflowen kjører testene og publiserer en GitHub Release med automatisk genererte versjonsnotater og `reddit-autoscroll-v1.0.7.zip`. ZIP-pakken inneholder kun utvidelsesfilene og er usignert. Permanent installasjon i vanlig Firefox krever signering hos Mozilla.

Du kan også velge **Actions → Release → Run workflow**, velge branch og la taggfeltet stå tomt. Workflowen bruker versjonen i `manifest.json` og oppretter taggen fra valgt commit hvis den ikke finnes. En eksisterende tagg må peke på samme commit. Oppgi en eksisterende tagg i feltet hvis du vil publisere akkurat den versjonen. Release må ikke allerede finnes. Ingen ekstra secrets kreves; workflowen bruker GitHubs innebygde token.
