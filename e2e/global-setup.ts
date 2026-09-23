import { adminKlient } from './helpers/admin-klient'
import { fjernFeilLoggGrense, skrivFeilLoggGrense } from './helpers/feil-logg-grense'
import { verifiserByggArtefakt, verifiserPrerenderManifest } from './helpers/bygg-artefakt-vakt'

/**
 * Global setup: fanger høyeste `feil_logg.id` FØR noen test har kjørt, og
 * legger den på disk. feil_logg-vakten i sider-laster.spec.ts filtrerer på
 * `id > grense` og ser dermed kun rader som denne kjøringen selv skrev.
 *
 * Hvorfor ikke `test.beforeAll` (#539-review): Playwright kjører beforeAll på
 * nytt i en fersk worker ved retry, og `retries: 1` er satt i CI. Blir vakten
 * rød, retries den ALENE — grensen ble da satt på nytt ETTER at alle rute-
 * testene var ferdige, vinduet var tomt, og vakten reparerte seg selv til
 * grønt (reprodusert: `--retries=1` ga «1 flaky» og exit 0). globalSetup
 * kjører én gang per KJØRING, utenfor worker-livssyklusen, så grensen kan ikke
 * flytte seg under en retry.
 *
 * Hvorfor id og ikke tidsstempel: en tidsgrense sammenlignet runnerens klokke
 * (Node) mot `feil_logg.opprettet` (Postgres `now()`). Test-DB-en kjører på en
 * annen maskin (192.168.10.10 lokalt), så ligger DB-klokka bak, filtreres ekte
 * rader bort og vakten blir falskt grønn. En monoton bigserial har ingen
 * klokke å drifte fra — samme grep lib/actions/ulest.ts bruker for å unngå
 * klokkedrift Node↔Postgres.
 */
export default async function globalSetup() {
  const supabase = adminKlient('global-setup-feillogg-grense')
  if (!supabase) {
    // Uten test-instans skipper alle specs (harTestCreds), så ingen vakt leser
    // grensen. Rydd likevel bort en fil fra en tidligere kjøring: en stale
    // grense er verre enn ingen, fordi den ser gyldig ut.
    fjernFeilLoggGrense()
    return
  }

  // Artefaktvakt (#659) — bor her, ikke bare i workflowen, så den også fanger
  // et foreldet LOKALT bygg. Kjøres FØR feil_logg-grensen: er byggartefaktet
  // feil, er resten av kjøringen meningsløs, og vi vil vite det med det
  // samme — ikke etter en runde med feil_logg-oppslag som uansett kastes bort.
  // Trygt å kalle her: Playwrights egen rekkefølge (plugin-setup, deriblant
  // webServer, FØR config.globalSetup) garanterer at `next start` allerede
  // har svart på helsesjekken når vi når denne linjen, så byggkatalogen
  // finnes. Se e2e/helpers/bygg-artefakt-vakt.ts for detaljene.
  const testUrl = process.env.E2E_SUPABASE_URL
  if (!testUrl) {
    throw new Error('global-setup: E2E_SUPABASE_URL mangler — kan ikke verifisere byggartefaktet.')
  }
  verifiserByggArtefakt(testUrl)
  verifiserPrerenderManifest()

  const { data, error } = await supabase
    .from('feil_logg')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Fail-closed: uten en pålitelig grense kan vakten bare ta feil i én av to
  // retninger (lese hele tabellen, eller ingenting). Da er det bedre at hele
  // kjøringen stopper her, med årsaken synlig.
  if (error) throw new Error(`global-setup: kunne ikke lese feil_logg.id: ${error.message}`)

  // Tom tabell (fersk CI-database) → 0, som slipper gjennom alle nye rader.
  skrivFeilLoggGrense(data?.id ?? 0)
}
