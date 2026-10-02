import { type Page, test } from '@playwright/test'

/**
 * Venter på at en Next.js server action er avgjort server-side (status mottatt),
 * FØR testen går videre til en UI-assertion (#800). Beviser ikke at
 * mutasjonen lyktes — se nederst.
 *
 * Hvorfor en UI-assertion alene ikke holder: Next sin server-action-reducer
 * kaller `resolve(actionResult)` på transition-en FØR det nye RSC-treet er
 * committet til DOM-en. Et panel som lukker seg eller en rad som forsvinner
 * beviser derfor bare at React har begynt å behandle svaret — ikke at selve
 * handlingen (databasemutasjonen) faktisk gikk gjennom.
 *
 * Bruk: pakk INN selve klikket som trigger server actionen. UI-assertionen
 * som faktisk beviser at skjermen oppdaterte seg, kommer ETTER kallet:
 *
 *   await ventPaaServerAction(page, () => knapp.click())
 *   await expect(rad).toHaveCount(0, { timeout: 15_000 })
 *
 * Ingen eksplisitt timeout settes på ventingen på responsen — testens egen
 * timeout er grensen, ikke et nytt magisk tall her.
 *
 * AVVIK FRA DEN OPPRINNELIGE PLANEN (#800, dokumentert her fordi det er en
 * reell implementasjonsoppdagelse, ikke en stilvalg): planen ba om å awaite
 * `respons.finished()` — ventet til HELE RSC-strømmen er mottatt, ikke bare
 * at responsen har startet. I praksis hang `.finished()` konsekvent i denne
 * stacken (bekreftet med `--repeat-each=3`: 17 av 82 kjøringer tømte
 * Playwrights test-timeout på nøyaktig denne linjen, uavhengig av om
 * actionen redirectet eller ikke). Et forsøk med `respons.body()` i stedet
 * ga samme symptom, men med en annen feil: «Protocol error
 * (Network.getResponseBody): No data found for resource with given
 * identifier» — CDP hadde allerede sluppet responsdataen før vi spurte etter
 * den. Service workeren (public/sw.js) er UTELUKKET som årsak: den
 * returnerer tidlig på `request.method !== 'GET'` og rører aldri POST-et som
 * bærer server actionen.
 *
 * ÅRSAKEN ER UAVKLART. To forklaringer passer symptomet, og vi har ikke
 * skilt dem: (a) en CDP/Chromium-detalj ved observasjon av en chunket
 * RSC-strøm — ufarlig for appen; eller (b) at RSC-strømmen faktisk ikke
 * lukkes, som da kan være SAMME feilklasse som den manglende UI-committen
 * #800 handler om. Ikke bygg videre på (a) som om den var bevist.
 *
 * Én CI-trace (PR #802, kart-markering «symbolet velges…») peker mot (b):
 * action-POST-en fikk 200 + `x-action-revalidated` på 88 ms, skjemaet lukket
 * seg (actionresultatet `{ ok: true }` nådde klienten), men responskroppen
 * ble aldri ferdig — Chromium meldte den `net::ERR_ABORTED` før test-
 * teardown — og den revaliderte siden ble aldri committet: markeringen fantes
 * verken på kartet eller i lista etter 15 s. Ett tilfelle, ikke bevis.
 *
 * Hva statuskoden beviser — og hva den IKKE beviser: Next sin action-handler
 * kjører og avventer actionen (inkludert en eventuell `redirect()`) FØR den
 * skriver responsens status/headere — se `res.statusCode = ...` i
 * node_modules/next/dist/server/app-render/action-handler.js. Status via
 * `waitForResponse()` betyr derfor at action-kallet er AVGJORT server-side:
 * det kastet ikke (→ 500) og redirectet eventuelt (→ 303). Det betyr IKKE at
 * domenemutasjonen lyktes — en action kan returnere `{ ok: false }` med 200
 * (f.eks. kart-actions). Det beviser heller ikke at React har committet det
 * nye treet. En UI- eller DB-assertion etterpå må fortsatt bevise utfallet,
 * med romslig timeout.
 */
export async function ventPaaServerAction(page: Page, utloeser: () => Promise<void>): Promise<void> {
  // Må registreres FØR utløseren kjører — ellers kan responsen komme og gå
  // før lytteren er på plass, og ventingen hadde håndtert "for sent" ved å
  // henge til testens egen timeout i stedet for å si noe fornuftig.
  const responsPromise = page.waitForResponse(
    r => r.request().method() === 'POST' && r.request().headers()['next-action'] !== undefined,
    { timeout: 0 },
  )

  const start = Date.now()
  await utloeser()

  const respons = await responsPromise

  // 200 = normal retur. 303 (See Other) = actionen kalte selv redirect() —
  // se RedirectStatusCode.SeeOther i
  // node_modules/next/dist/server/app-render/action-handler.js. Begge betyr
  // «kallet kastet ikke» — IKKE at mutasjonen lyktes (`{ ok: false }` kommer
  // også med 200). Alt annet (f.eks. 500 fra en kastet feil) er et reelt avvik.
  const status = respons.status()
  if (status !== 200 && status !== 303) {
    throw new Error(
      `Server action svarte ${status} i stedet for 200/303 (${respons.url()}) — selve handlingen feilet, ikke UI-oppdateringen etterpå.`,
    )
  }

  test.info().annotations.push({ type: 'server-action', description: `${Date.now() - start} ms` })
}
