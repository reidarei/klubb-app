import { adminKlient } from './helpers/admin-klient'
import { fjernFeilLoggGrense, skrivFeilLoggGrense } from './helpers/feil-logg-grense'

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
