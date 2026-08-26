import type { Endring } from '@/lib/endringslogg'

/**
 * Endringslogg som vises på «Om appen»-siden.
 *
 * Legg til nye oppføringer med nyeste først. Terskelen er: «Merker et medlem dette?»
 * Rene refaktorer, test-dekning og sikkerhetstiltak hører ikke hjemme her
 * (de dekkes av de utledede «mindre»-radene).
 *
 * Fylles inn av klubben som eier denne instansen.
 *
 * **Om innspill-varsler:** Når et medlem sender inn en forslag eller bugrapport via
 * innspill-funksjonen, og du lukker GitHub-issuet, sender appen et varsel til medlemmet.
 * Teksten i varselet hentes fra endringslogg-oppføringen som er merket med det samme
 * issue-nummeret via `innspill: [<nr>]`. Skriv beskjeden direkte til medlemmet (ikke
 * til deg selv) — det er ordrett teksten han mottar i varselet når issuet lukkes.
 * Hvis ingen oppføring er merket med issuet, brukes en generisk standardtekst.
 */
export const ENDRINGER: Endring[] = []
