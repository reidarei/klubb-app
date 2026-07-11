import { formatInTimeZone } from 'date-fns-tz'
import { nb } from 'date-fns/locale'

export const TIDSSONE = 'Europe/Oslo'

// Felles format-strenger brukt flere steder i appen.
export const FORMAT_DATO_KLOKKE = "d. MMMM 'kl.' HH:mm"

/**
 * Formater en ISO-dato i norsk tidssone (Europe/Oslo).
 * Håndterer sommer/vintertid automatisk.
 * Bruk denne overalt i stedet for date-fns format() — viktig fordi
 * serveren kjører i UTC (Dublin), og klienter kan være i andre tidssoner.
 */
export function formaterDato(iso: string, formatStr: string): string {
  return formatInTimeZone(new Date(iso), TIDSSONE, formatStr, { locale: nb })
}

/**
 * Nå-tidsstempel som ISO-streng (UTC). Bruk denne i stedet for
 * `new Date().toISOString()` direkte i kolonner som `oppdatert`,
 * `besluttet_paa` o.l. — gjør det åpenbart at vi mener "nå" og holder
 * en åpning hvis vi senere vil mocke tid i tester.
 */
export function naa(): string {
  return new Date().toISOString()
}

/**
 * Returner "nå" som Date i norsk tidssone-kontekst.
 * Nyttig for sammenligninger som "er dette i dag?" der
 * "i dag" skal bety norsk dato, ikke UTC.
 */
export function norskDatoNaa(): Date {
  // Lag en dato-streng i norsk tidssone og parse den tilbake
  const norskNaa = formatInTimeZone(new Date(), TIDSSONE, 'yyyy-MM-dd', { locale: nb })
  const [y, m, d] = norskNaa.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Dagens dato (norsk tidssone) som "YYYY-MM-DD"-streng. Bruk denne i stedet for
 * `new Date().toISOString().slice(0, 10)` — sistnevnte gir UTC-dato og kan bomme
 * med én dag rundt midnatt norsk tid. Nyttig for min/max på <input type="date">
 * og andre steder «hvilken kalenderdag er det i Norge» skal uttrykkes som streng.
 */
export function iDagOslo(): string {
  return formatInTimeZone(new Date(), TIDSSONE, 'yyyy-MM-dd')
}

/**
 * Parse en ISO-dato til norsk dato (bare dag, uten klokkeslett).
 * Viktig for "er dette arrangement i dag?"-sjekker.
 */
export function norskDag(iso: string): Date {
  const norskStr = formatInTimeZone(new Date(iso), TIDSSONE, 'yyyy-MM-dd', { locale: nb })
  const [y, m, d] = norskStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Gjeldende år i norsk tidssone.
 * Viktig for server-side kode som kjører i UTC — på nyttårsaften
 * er det allerede nytt år i Oslo mens serveren fortsatt er i gammelt år.
 */
export function norskAar(): number {
  return parseInt(formatInTimeZone(new Date(), TIDSSONE, 'yyyy'))
}

/**
 * Returnerer årstallet (norsk tid) for en ISO-dato hvis det avviker fra
 * inneværende år, ellers tom streng. Brukes på agenda-kort så vi slipper å
 * vise «5. MAI» for et arrangement som faktisk er i 2027 — men beholder
 * kompakt format for hele inneværende år.
 */
export function aarHvisAvvik(iso: string): string {
  const aar = formatInTimeZone(new Date(iso), TIDSSONE, 'yyyy')
  return aar === String(norskAar()) ? '' : aar
}

/**
 * Dag-nøkkel i norsk tidssone — «yyyy-MM-dd»-streng for en ISO-dato.
 * Et arrangement kl 00:30 norsk tid skal telle på riktig dag, ikke UTC-dagen
 * før. Brukes av MiniKalender og erSammeNorskeDag. Se #429.
 */
export function norskDatoNokkel(iso: string): string {
  return formatInTimeZone(new Date(iso), TIDSSONE, 'yyyy-MM-dd')
}

/**
 * Sammenligner om to ISO-tidspunkter faller på samme norske kalenderdag.
 * Viktig: bruker Oslo-tidssone så en melding sendt 01:30 norsk tid teller
 * som "i dag", ikke "i går" basert på UTC.
 */
export function erSammeNorskeDag(isoA: string, isoB: string): boolean {
  // Delegerer til norskDatoNokkel — unngår duplisert formatInTimeZone-kall.
  return norskDatoNokkel(isoA) === norskDatoNokkel(isoB)
}

/**
 * Returnerer en kontekst-følsom dato-etikett for chat-dato-skiller:
 * "I DAG", "I GÅR", ukedag ("FREDAG") for siste 7 dager, ellers "15. MARS"
 * eller "15. MARS 2024" hvis annet år. Etiketten kommer UPPERCASE allerede
 * — kallstedet trenger ikke text-transform.
 */
export function formaterDatoSkille(iso: string): string {
  // Diff må regnes i UTC for å være DST-trygg — norskDatoNaa/norskDag returnerer
  // Date-objekter konstruert i prosessens *lokale* tidssone, så ms-aritmetikk
  // på dem kan svikte med ±1 time over DST-overganger. Vi henter Oslo-kalenderen
  // som "yyyy-MM-dd"-streng og konstruerer rene UTC-Date for diff istedet.
  const dagStr = (d: Date) => formatInTimeZone(d, TIDSSONE, 'yyyy-MM-dd')
  const tilUtc = (s: string) => {
    const [y, m, d] = s.split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  const diffMs = tilUtc(dagStr(new Date())) - tilUtc(dagStr(new Date(iso)))
  const dager = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (dager === 0) return 'I DAG'
  if (dager === 1) return 'I GÅR'
  if (dager >= 2 && dager <= 6) {
    return formaterDato(iso, 'EEEE').toUpperCase()
  }
  const sammeAar = formatInTimeZone(new Date(iso), TIDSSONE, 'yyyy') === String(norskAar())
  return formaterDato(iso, sammeAar ? 'd. MMMM' : 'd. MMMM yyyy').toUpperCase()
}

/**
 * Valider at en streng er en lovlig kalender-dato på formen YYYY-MM-DD.
 * Tre lag: (1) regexen forkaster feil format, (2) Date.parse === NaN forkaster
 * grovt ugyldige verdier (2026-13-45), (3) round-trip-sjekken forkaster
 * roll-over-datoer som Date godtar men ruller videre — f.eks. 2026-02-30
 * → 3. mars. new Date(s) tolker YYYY-MM-DD som UTC-midnatt, så slice(0,10)
 * skal matche input eksakt for en reell dato.
 */
export function erGyldigKalenderdato(s: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s
  )
}

/**
 * Konverter ISO-dato til datetime-local verdi i norsk tidssone.
 * Brukes for å pre-fylle <input type="datetime-local"> med riktig tid.
 */
export function isoTilDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  return formatInTimeZone(new Date(iso), TIDSSONE, "yyyy-MM-dd'T'HH:mm")
}

/**
 * Konverter datetime-local verdi til ISO (UTC).
 * datetime-local gir "2025-06-15T14:30" uten tidssone —
 * vi tolker det som norsk tid og konverterer til UTC.
 */
export function datetimeLocalTilIso(localStr: string): string {
  if (!localStr) return ''
  // Parse datoen som norsk tid ved å legge på tidssone-offset
  const norskIso = `${localStr}:00`
  // Bruk formatInTimeZone "baklengs": finn UTC-ekvivalenten
  // ved å lage en Date med riktig norsk tid
  const [datePart, timePart] = localStr.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  const [h, mi] = timePart.split(':').map(Number)

  // Bruk Intl for å finne offset for denne datoen i Europe/Oslo
  const testDate = new Date(Date.UTC(y, m - 1, d, h, mi))
  const osloStr = testDate.toLocaleString('en-US', { timeZone: TIDSSONE })
  const osloDate = new Date(osloStr)
  const offsetMs = osloDate.getTime() - testDate.getTime()

  // Lag riktig UTC-tid: norsk tid minus offset
  const utcDate = new Date(Date.UTC(y, m - 1, d, h, mi) - offsetMs)
  return utcDate.toISOString()
}
