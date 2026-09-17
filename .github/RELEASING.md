# Publisere en versjon

1. Oppdater `version` i `manifest.json`, og commit og push endringene sammen med release-workflowen.
2. Opprett og push en tagg som matcher manifestversjonen:

   ```sh
   git tag v1.0.7
   git push origin v1.0.7
   ```

Release-workflowen kjører testene og publiserer en GitHub Release med automatisk genererte versjonsnotater og `reddit-autoscroll-v1.0.7.zip`. ZIP-pakken inneholder kun utvidelsesfilene og er usignert. Permanent installasjon i vanlig Firefox krever signering hos Mozilla.

En eksisterende tagg kan også publiseres via **Actions → Release → Run workflow** ved å oppgi taggen. Taggen må inneholde workflowen, og release må ikke allerede finnes. Ingen ekstra secrets kreves; workflowen bruker GitHubs innebygde token.
