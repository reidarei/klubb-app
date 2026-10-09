// All tidshåndtering går gjennom denne fila — se CLAUDE.md § Policy: Tidshåndtering.
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { nb } from 'date-fns/locale'

export const TIDSSONE = 'Europe/Oslo'

export const FORMAT_DATO_KLOKKE = "d. MMMM 'kl.' HH:mm"
// Der datoen allerede er gitt av konteksten («I morgen kl. 18:00»).
export const FORMAT_KLOKKE = "'kl.' HH:mm"
// Der klokkeslettet står i en egen setning («Oppmøte {sted} kl. {tid}»).
export const FORMAT_DATO_KORT = 'd. MMMM'
// Der visningen lever over årsskifter og «5. mai» alene er tvetydig (#595).
export const FORMAT_DATO_AAR = 'd. MMMM yyyy'

/**
 * Formater en ISO-dato i Europe/Oslo. Bruk denne i stedet for date-fns
 * format() — serveren kjører i UTC.
 */
export function formaterDato(iso: string, formatStr: string): string {
  return formatInTimeZone(new Date(iso), TIDSSONE, formatStr, { locale: nb })
}

/**
 * «Nå» som ISO-streng (UTC) for timestamp-kolonner (`oppdatert`,
 * `besluttet_paa` o.l.). Ett sted å mocke tid i tester.
 */
export function naa(): string {
  return new Date().toISOString()
}

/**
 * Dagens Oslo-kalenderdag som LOKAL Date (lokal midnatt). Riktig for lokale
 * gettere og date-fns-kalenderaritmetikk — aldri send den gjennom
 * toISOString() (#675).
 */
export function norskDatoNaa(): Date {
  const norskNaa = formatInTimeZone(new Date(), TIDSSONE, 'yyyy-MM-dd', { locale: nb })
  const [y, m, d] = norskNaa.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Dagens dato i Oslo som "YYYY-MM-DD". `new Date().toISOString().slice(0, 10)`
 * gir UTC-dato og bommer rundt norsk midnatt.
 */
export function iDagOslo(): string {
  return formatInTimeZone(new Date(), TIDSSONE, 'yyyy-MM-dd')
}

/**
 * Oslo-kalenderdag i dag ± `dager` som "YYYY-MM-DD". Ren UTC-aritmetikk på
 * datostrengen, så TZ-uavhengig og DST-trygt. Erstatter
 * `dagStreng(addDays(norskDatoNaa(), n))`, som kun var riktig i en UTC-prosess (#675).
 *
 * Oppgi `anker` når FLERE grenser må hvile på samme dag — to separate
 * iDagOslo()-kall kan havne på hver sin side av midnatt (#755).
 */
export function osloDagPluss(dager: number, anker: string = iDagOslo()): string {
  const [y, m, d] = anker.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + dager)).toISOString().slice(0, 10)
}

/** Morgendagens dato i Oslo som "YYYY-MM-DD". */
export function iMorgenOslo(): string {
  return osloDagPluss(1)
}

/**
 * UTC-instantet for norsk midnatt i dag ± `dager`, som ISO-streng — for
 * spørringsgrenser mot timestamptz (#675). `anker` som i osloDagPluss().
 */
export function osloDagStartIso(dager = 0, anker: string = iDagOslo()): string {
  return fromZonedTime(`${osloDagPluss(dager, anker)}T00:00:00`, TIDSSONE).toISOString()
}

/**
 * "YYYY-MM-DD" fra en Dates LOKALE gettere. KUN riktig for en Date som
 * allerede er en Oslo-kalenderdag (norskDatoNaa()/norskDag()); bruk
 * norskDatoNokkel() for et instant (#675).
 */
export function osloDagNokkel(dag: Date): string {
  const y = dag.getFullYear()
  const m = String(dag.getMonth() + 1).padStart(2, '0')
  const d = String(dag.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Mandagen i inneværende ISO-uke (Oslo) som "YYYY-MM-DD". Må matche Postgres'
 * `date_trunc('week', …)`. Ren UTC-aritmetikk på datostrengen, så DST-trygt (#484).
 */
export function osloUkestart(): string {
  const [y, m, d] = iDagOslo().split('-').map(Number)
  const utcDato = new Date(Date.UTC(y, m - 1, d))
  // Ikke date-fns' getISODay(): den bruker lokal getDay() og ville driftet på
  // en klubb-app-instans med negativ UTC-offset. Søndag (0) → 7 som i ISO.
  const isoDag = utcDato.getUTCDay() === 0 ? 7 : utcDato.getUTCDay() // 1 (mandag)..7 (søndag)
  utcDato.setUTCDate(utcDato.getUTCDate() - (isoDag - 1))
  return utcDato.toISOString().slice(0, 10)
}

/**
 * Oslo-kalenderdagen for et ISO-instant, som LOKAL Date (se norskDatoNaa()).
 */
export function norskDag(iso: string): Date {
  const norskStr = formatInTimeZone(new Date(iso), TIDSSONE, 'yyyy-MM-dd', { locale: nb })
  const [y, m, d] = norskStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Gjeldende år i Oslo — på nyttårsaften er det nytt år her før det er det i UTC.
 */
export function norskAar(): number {
  return parseInt(formatInTimeZone(new Date(), TIDSSONE, 'yyyy'))
}

/**
 * Årstallet (Oslo) for en ISO-dato hvis det avviker fra inneværende år, ellers
 * tom streng — så agenda-kort viser år kun når det trengs.
 */
export function aarHvisAvvik(iso: string): string {
  const aar = formatInTimeZone(new Date(iso), TIDSSONE, 'yyyy')
  return aar === String(norskAar()) ? '' : aar
}

/**
 * Agenda-dato i Oslo-tid: «Fre 12. des», med år kun utenom inneværende år.
 * nb-locale gir «fr.» for EEE, så ukedagen kappes fra hele navnet.
 */
export function agendaDato(iso: string): string {
  const ukedag = formaterDato(iso, 'EEEE').slice(0, 3)
  const ukedagStor = ukedag.charAt(0).toUpperCase() + ukedag.slice(1)
  // Kun et avsluttende punktum: nb skriver «des.», men «mai» har ingen.
  const dagMnd = formaterDato(iso, 'd. MMM').replace(/\.$/, '')
  const aar = aarHvisAvvik(iso)
  return `${ukedagStor} ${dagMnd}${aar ? ` ${aar}` : ''}`
}

/**
 * Oslo-dag-nøkkel ("yyyy-MM-dd") for et ISO-instant — 00:30 norsk tid teller
 * på riktig dag, ikke UTC-dagen før (#429).
 */
export function norskDatoNokkel(iso: string): string {
  return formatInTimeZone(new Date(iso), TIDSSONE, 'yyyy-MM-dd')
}

/**
 * UTC-instantet for norsk klokkeslett `klokke` DAGEN ETTER `iso`s Oslo-dag.
 * Forankret til `iso`s egen dag (ikke i dag), så et bakoverskuende oppslag
 * regner riktig. Brukt av møtemodus (#780).
 */
export function osloKlokkeslettDagenEtter(iso: string, klokke: string): string {
  return fromZonedTime(`${osloDagPluss(1, norskDatoNokkel(iso))}T${klokke}:00`, TIDSSONE).toISOString()
}

/** Om to ISO-instanter faller på samme Oslo-kalenderdag. */
export function erSammeNorskeDag(isoA: string, isoB: string): boolean {
  return norskDatoNokkel(isoA) === norskDatoNokkel(isoB)
}

/**
 * Om et ISO-instant faller på en Oslo-kalenderdag (fra norskDatoNaa()/
 * norskDag()). Bevisst annet navn enn erSammeNorskeDag(), som tar to
 * instanter (#675).
 */
export function erPaaOsloDag(iso: string, osloDag: Date): boolean {
  return norskDatoNokkel(iso) === osloDagNokkel(osloDag)
}

/**
 * Etikett for chat-dato-skiller: «I DAG», «I GÅR», ukedag siste 7 dager,
 * ellers «15. MARS» (med år hvis annet år). Kommer ferdig i versaler.
 */
export function formaterDatoSkille(iso: string): string {
  // Diffen regnes på rene UTC-Dates fra Oslo-datostrenger: ms-aritmetikk på
  // lokale Dates kan bomme ±1 t over DST-overganger.
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
 * Om strengen er en lovlig YYYY-MM-DD-dato. Round-trip-sjekken fanger
 * roll-over som Date godtar (2026-02-30 → 3. mars); new Date(s) tolker formen
 * som UTC-midnatt, så slice(0, 10) skal matche eksakt.
 */
export function erGyldigKalenderdato(s: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s
  )
}

/** ISO-dato til verdi for <input type="datetime-local"> i Oslo-tid. */
export function isoTilDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  return formatInTimeZone(new Date(iso), TIDSSONE, "yyyy-MM-dd'T'HH:mm")
}

/**
 * datetime-local-verdi («2025-06-15T14:30», uten sone) tolket som Oslo-tid,
 * til ISO (UTC).
 */
export function datetimeLocalTilIso(localStr: string): string {
  if (!localStr) return ''
  // Ikke bytt til en håndregnet offset via toLocaleString: den tolkes i
  // maskinens sone, og i medlemmets nettleser ga det tider lagret 1–2 t for
  // sent (#674). fromZonedTime håndterer sommer-/vintertid selv.
  return fromZonedTime(localStr, TIDSSONE).toISOString()
}
