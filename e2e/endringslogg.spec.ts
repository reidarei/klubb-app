import { test, expect } from '@playwright/test'
import { harTestCreds } from './helpers/auth'

// «Hva er nytt»-seksjonen på /om-appen (#595). sider-laster.spec.ts dekker
// kun at siden laster uten feil — denne spec-en ser faktisk på innholdet.
//
// Seksjonen rendres betinget (kun når ENDRINGER ikke er tom, se
// app/(app)/om-appen/page.tsx). I klubb-app (nedstrøms open source-repoet,
// se CLAUDE.md § Policy: Synk) er lib/endringslogg-data.ts en egen,
// uavhengig DIVERGERER-fil med tom ENDRINGER-liste, og seksjonen skal da
// rett og slett ikke finnes der. Denne spec-en krever derfor ALDRI at
// seksjonen finnes — den sjekker bare at NÅR den finnes, ligger den riktig
// og har innhold. Det holder testen grønn i begge repoer uten
// spesialtilfeller eller en egen skru-av-bryter.
test.describe('/om-appen — «Hva er nytt»', () => {
  test.skip(
    !harTestCreds(),
    'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md og docs/test-instans.md',
  )

  test('rendrer mellom Personvern og Spørsmål eller forslag, med minst én rad', async ({
    page,
  }) => {
    await page.goto('/om-appen')
    await expect(page.getByText('Personvern', { exact: true })).toBeVisible()
    await expect(page.getByText('Spørsmål eller forslag?', { exact: true })).toBeVisible()

    const overskrift = page.getByText('Hva er nytt', { exact: true })
    if ((await overskrift.count()) === 0) {
      // Forventet i klubb-app (tom ENDRINGER) — se kommentaren over.
      return
    }

    await expect(overskrift).toBeVisible()

    // Rekkefølge via tekstposisjon i <main>, ikke bounding boxes — enklere
    // og mindre skjørt for fremtidige layoutendringer. SectionLabel har
    // text-transform: uppercase, og innerText() (i motsetning til
    // textContent()) respekterer CSS-rendering — derfor lowerCase()-es
    // begge sider av sammenligningen.
    const tekst = (await page.locator('main').innerText()).toLowerCase()
    const iPersonvern = tekst.indexOf('personvern')
    const iHvaErNytt = tekst.indexOf('hva er nytt')
    const iSporsmaal = tekst.indexOf('spørsmål eller forslag?')
    expect(iPersonvern, 'Personvern ikke funnet').toBeGreaterThanOrEqual(0)
    expect(iHvaErNytt, 'Hva er nytt ikke funnet').toBeGreaterThan(iPersonvern)
    expect(iSporsmaal, 'Spørsmål eller forslag? ikke funnet').toBeGreaterThan(iHvaErNytt)

    // Minst én versjonsrad i seksjonen.
    const rader = page.locator('#endringslogg-innhold > div')
    await expect(rader.first()).toBeVisible()
    expect(await rader.count()).toBeGreaterThan(0)
  })
})
