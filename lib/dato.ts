import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { nb } from 'date-fns/locale'

export const TIDSSONE = 'Europe/Oslo'

// Felles format-strenger brukt flere steder i appen.
export const FORMAT_DATO_KLOKKE = "d. MMMM 'kl.' HH:mm"
// Kun klokkeslett — brukes der datoen allerede er gitt av konteksten, f.eks.
// 1-dagers-påminnelsen som innledes med «I morgen».
export const FORMAT_KLOKKE = "'kl.' HH:mm"
// Kun dato — brukes der klokkeslettet står i en egen setning, f.eks.
// påminnelsenes «Oppmøte {sted} kl. {tid}».
export const FORMAT_DATO_KORT = 'd. MMMM'
// Dato med årstall — brukes der visningen lever over årsskifter og «5. mai»
// alene ville vært tvetydig, f.eks. endringsloggen på /om-appen (#595).
export const FORMAT_DATO_AAR = 'd. MMMM yyyy'

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
 * Norsk kalenderdag i dag ± `dager`, som "YYYY-MM-DD"-streng. Bygges av ren
 * UTC-aritmetikk på iDagOslo()-strengen (samme knep som iMorgenOslo/
 * osloUkestart) — ingen lokal Date involvert, derfor tidssone-uavhengig og
 * DST-trygt. Erstatter mønsteret `dagStreng(addDays(norskDatoNaa(), n))`
 * som var tredje gang samme feilklasse slo til (#675): addDays() på en
 * norskDatoNaa()-Date + toISOString() regner riktig kun når PROSESSEN står
 * i UTC.
 *
 * `anker` er dagen aritmetikken går ut fra ("YYYY-MM-DD", default iDagOslo()).
 * Oppgi den eksplisitt når FLERE grenser må hvile på SAMME kalenderdag — to
 * uavhengige kall sampler hver sin `iDagOslo()`, og en kjøring som krysser
 * norsk midnatt mellom dem får to ulike dager. Se review av #755.
 */
export function osloDagPluss(dager: number, anker: string = iDagOslo()): string {
  const [y, m, d] = anker.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + dager)).toISOString().slice(0, 10)
}

/**
 * Morgendagens dato (norsk tidssone) som "YYYY-MM-DD"-streng — søsteren til
 * iDagOslo(). Brukt av bursdagsbilde-cronet (#641), som genererer bildet
 * dagen FØR bursdagen.
 */
export function iMorgenOslo(): string {
  return osloDagPluss(1)
}

/**
 * UTC-instantet for NORSK MIDNATT på dagen i dag ± `dager`, som ISO-streng.
 * Brukt der en spørring trenger en tidsgrense (f.eks. .gte('start_tidspunkt',
 * ...)) — ikke en dagstreng, det er osloDagPluss() sin jobb. fromZonedTime
 * tolker "YYYY-MM-DDT00:00:00" som veggklokke-tid i TIDSSONE og håndterer
 * sommer-/vintertid selv. Se #675.
 *
 * `anker` videreføres til osloDagPluss() — bruk den når de to endene av et
 * halvåpent døgnvindu skal forankres til samme dag (se review av #755).
 */
export function osloDagStartIso(dager = 0, anker: string = iDagOslo()): string {
  return fromZonedTime(`${osloDagPluss(dager, anker)}T00:00:00`, TIDSSONE).toISOString()
}

/**
 * Dag-nøkkel ("YYYY-MM-DD") fra en Dates *lokale* gettere. KUN riktig for en
 * Date som allerede ER en Oslo-kalenderdag (fra norskDatoNaa()/norskDag()) —
 * gir feil svar på et instant (en Date bygget av `new Date(iso)`). Bruk
 * norskDatoNokkel() for et instant. Se #675.
 */
export function osloDagNokkel(dag: Date): string {
  const y = dag.getFullYear()
  const m = String(dag.getMonth() + 1).padStart(2, '0')
  const d = String(dag.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Mandagen i inneværende ISO-uke (norsk tidssone), som "YYYY-MM-DD"-streng.
 * Må matche Postgres' `date_trunc('week', ...)`, som også er mandag-basert.
 * Regner på Oslo-kalenderdato-strengen (via iDagOslo) og gjør deretter ren
 * UTC-dato-aritmetikk med getUTCDay/setUTCDate — DST-trygt fordi vi aldri
 * blander ms-differanser med lokal tidssone (samme knep som formaterDatoSkille).
 * Brukt av AktivitetTeller (#484) for å bucket-slå anonym ukentlig aktivitet.
 */
export function osloUkestart(): string {
  const [y, m, d] = iDagOslo().split('-').map(Number)
  const utcDato = new Date(Date.UTC(y, m - 1, d))
  // getUTCDay() gir 0 (søndag)..6 (lørdag). date-fns' getISODay() bruker internt
  // getDay() (lokaltid) og ville drifte på en runtime med negativ UTC-offset —
  // relevant fordi dette er delt template-kode som synkes til selvhostede
  // klubb-app-instanser. Map søndag (0) → 7 så mandag blir 1, som ISO.
  const isoDag = utcDato.getUTCDay() === 0 ? 7 : utcDato.getUTCDay() // 1 (mandag)..7 (søndag)
  utcDato.setUTCDate(utcDato.getUTCDate() - (isoDag - 1))
  return utcDato.toISOString().slice(0, 10)
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
 * UTC-instantet for et gitt norsk klokkeslett DAGEN ETTER `iso`s norske
 * kalenderdag, som ISO-streng. Brukt av møtemodus (#780): et møte som starter
 * 00:30 skal fortsatt vare til kl. 06:00 dagen ETTER (ikke samme dag) —
 * `osloDagPluss(1, …)` løser akkurat den forskyvningen, forankret til `iso`s
 * EGEN dag (ikke dagens dato) slik at et bakoverskuende oppslag regner riktig
 * uansett når det kjøres. DST-trygt og TZ-uavhengig, samme knep som
 * osloDagStartIso(): fromZonedTime tolker strengen som veggklokke-tid i
 * TIDSSONE — ingen lokal Date, ingen toISOString() på en Oslo-kalenderdag
 * (jf. hk/dato-tidssone-uavhengig).
 */
export function osloKlokkeslettDagenEtter(iso: string, klokke: string): string {
  return fromZonedTime(`${osloDagPluss(1, norskDatoNokkel(iso))}T${klokke}:00`, TIDSSONE).toISOString()
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
 * Sammenligner et ISO-instant mot en Oslo-kalenderdag (fra norskDatoNaa()/
 * norskDag()). Flyttet hit fra lib/agenda-sortering.ts (#675), som hadde sin
 * egen `erSammeNorskeDag(iso, referanse: Date)` — samme navn som funksjonen
 * over men annen signatur og betydning, en felle for neste leser. Erstatter
 * et rått Intl.DateTimeFormat-kall.
 */
export function erPaaOsloDag(iso: string, osloDag: Date): boolean {
  return norskDatoNokkel(iso) === osloDagNokkel(osloDag)
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
  // fromZonedTime tolker "2026-09-13T11:00" som veggklokke-tid i TIDSSONE og
  // gir UTC-ekvivalenten. Håndterer sommer-/vintertid selv.
  //
  // Den håndskrevne varianten som sto her (#674) regnet ut offseten via
  // `new Date(dato.toLocaleString('en-US', { timeZone }))`. Den parsingen
  // tolker strengen i MASKINENS lokale sone, ikke i Oslo — så offseten ble
  // riktig kun der maskinen allerede stod i UTC. Alle fire kallstedene er
  // 'use client': koden kjører i medlemmets nettleser, som står i norsk tid,
  // og der ble offseten 0. Resultat: hvert tidspunkt lagret to timer for sent
  // om sommeren, én om vinteren. Ikke bytt tilbake til en egen offset-regning.
  return fromZonedTime(localStr, TIDSSONE).toISOString()
}
