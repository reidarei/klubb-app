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
 * Sammenligner om to ISO-tidspunkter faller på samme norske kalenderdag.
 * Viktig: bruker Oslo-tidssone så en melding sendt 01:30 norsk tid teller
 * som "i dag", ikke "i går" basert på UTC.
 */
export function erSammeNorskeDag(isoA: string, isoB: string): boolean {
  const a = formatInTimeZone(new Date(isoA), TIDSSONE, 'yyyy-MM-dd')
  const b = formatInTimeZone(new Date(isoB), TIDSSONE, 'yyyy-MM-dd')
  return a === b
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
