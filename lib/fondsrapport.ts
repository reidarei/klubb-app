// Fondsrapport (#785) — kvartalsvis kontantstatus, lagret som lesbar tekst
// nederst i et vanlig innlegg (meldinger.innhold), IKKE i egne DB-kolonner.
// Bindende ramme fra #785: ingen migrasjon, ingen ny tabell —
// tallene skal stå i selve innleggsteksten, og kortet tegnes ut fra teksten.
// Denne fila er ren og har ingen I/O: trygg å importere fra både server
// actions og klientkomponenter (FondsrapportBlokk).
//
// Formatet — hilsenen (valgfri, fritekst) står øverst, skilt med en blank
// linje fra blokken, som alltid står SIST i innholdet:
//
//   [Fondsrapport Q3 2026 · per 26.09.2026]
//   Kontanter: 24 701 kr (Q2 2026: 19 551 kr)
//   Kjell: 7 948 kr (+1 600) ~a1b2c3d4
//   Geir: 1 200 kr (ny) ~0f9e8d7c
//   Per: 3 000 kr (±0) ~5e6f7a8b
//   Ola: 2 900 kr (-100) ~9c0d1e2f
//
// Tall i teksten bruker ASCII-mellomrom som tusenskille og ASCII «-» som
// minustegn — kortet (FondsrapportBlokk) konverterer til U+2212 ved
// VISNING. To ulike tegnsett for samme fortegn, bevisst: teksten skal
// parse's tilbake IDENTISK uansett miljø, og ASCII er det eneste trygge der.

import { FONDSRAPPORT_EGNE_FARGER, FONDSRAPPORT_REF_LENGDE } from './konstanter'

export type Kvartal = 1 | 2 | 3 | 4

export type FondsrapportLinje = {
  /** Slutten av innskyterens profil_id (se refFor) — nok til å skille ~18 medlemmer, ikke en fullstendig id. */
  ref: string
  navn: string
  belop: number
  endring: number | 'ny'
}

export type Fondsrapport = {
  aar: number
  kvartal: Kvartal
  /** Dato for siste oppgjør — «YYYY-MM-DD». IKKE kvartalsslutt, se issue #785. */
  perDato: string
  kontanter: number
  forrige: { aar: number; kvartal: Kvartal; kontanter: number }
  linjer: FondsrapportLinje[]
}

// Grunnlaget forrige-kvartalstall bygges av, enten hentet fra en tidligere
// publisert rapport eller regnet ut av fondsdata (forrigeFraFondsdata under).
// perProfilOere er iØRE (ikke hele kroner) — endringen i byggFondsrapport()
// regnes ut på avrundede heltallskroner, men selve grunnlaget holdes
// presist så avrundingen skjer på riktig sted (se byggFondsrapport).
export type ForrigeGrunnlag = {
  aar: number
  kvartal: Kvartal
  kontanter: number
  perProfilOere: Record<string, number>
}

// ─── Regex — strengt format, alt eller ingenting ──────────────────────────

const HEADER_RE = /^\[Fondsrapport Q([1-4]) (\d{4}) · per (\d{2})\.(\d{2})\.(\d{4})\]$/
const TALL = '\\d{1,3}(?: \\d{3})*'
const KONTANTER_RE = new RegExp(
  `^Kontanter: (${TALL}) kr \\(Q([1-4]) (\\d{4}): (${TALL}) kr\\)$`,
)
const LINJE_RE = new RegExp(
  `^(.+): (${TALL}) kr \\((\\+${TALL}|ny|±0|-${TALL})\\) ~([0-9a-f]{8})$`,
)

// ─── Tallformattering (ASCII — se filhode) ────────────────────────────────

// Grupperer et ikke-negativt heltall med ASCII-mellomrom som tusenskille.
// IKKE toLocaleString('nb') — den bruker et NBSP (U+00A0) som tusenskille,
// og en tekst som skal parse's tilbake byte-for-byte kan ikke være avhengig
// av hvilket mellomrom Intl velger å bruke i det aktuelle kjøremiljøet.
function grupperTusen(n: number): string {
  return Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

function parseTall(s: string): number {
  return parseInt(s.replace(/ /g, ''), 10)
}

/**
 * Ref-en en profil får i rapportteksten: de SISTE FONDSRAPPORT_REF_LENGDE
 * hex-tegnene av profil_id (uten bindestreker). Slutten, ikke starten: i prod
 * er begge like tilfeldige, men seed-profilene (`00000000-…-00000000000N`)
 * deler de første 8 tegnene og skilles kun i slutten. Eneste kilde — all
 * matching ref ↔ profil_id skal gå via denne (actions + FondsrapportBlokk).
 */
export function refFor(profilId: string): string {
  return profilId.replace(/-/g, '').slice(-FONDSRAPPORT_REF_LENGDE)
}

/** «24 701 kr» — hele kroner, ASCII-mellomrom, ingen desimaler. Kun ikke-negative beløp. */
export function heleKr(n: number): string {
  return `${grupperTusen(n)} kr`
}

// ─── Dato — ren strengmanipulasjon, ingen Date (jf. Policy: Tidshåndtering:
// perDato er allerede en Oslo-kalenderdag som streng, og all aritmetikk her
// er på strengen selv, aldri via new Date()/toISOString()) ────────────────

function isoTilDDMMYYYY(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function ddmmyyyyTilIso(dd: string, mm: string, yyyy: string): string {
  return `${yyyy}-${mm}-${dd}`
}

/** Kvartal og år for en «YYYY-MM-DD»-dato. Ren strengaritmetikk. */
export function kvartalFor(dato: string): { aar: number; kvartal: Kvartal } {
  const [aar, mnd] = dato.split('-').map(Number)
  const kvartal = (Math.floor((mnd - 1) / 3) + 1) as Kvartal
  return { aar, kvartal }
}

/**
 * Profil-id-er som forekommer mer enn én gang. fond_innskudd skal ha én
 * snapshot-rad per person (mig. 126), men har ingen unik-constraint — en
 * duplikat ville gitt to linjer for samme mann i en frossen rapport.
 */
export function dupliserteProfilIder(profilIder: string[]): string[] {
  const sett = new Set<string>()
  const dupliserte = new Set<string>()
  for (const id of profilIder) {
    if (sett.has(id)) dupliserte.add(id)
    sett.add(id)
  }
  return [...dupliserte]
}

/** Forrige kvartal, med årsrull ved Q1 → forrige års Q4. */
export function forrigeKvartal(aar: number, kvartal: Kvartal): { aar: number; kvartal: Kvartal } {
  if (kvartal === 1) return { aar: aar - 1, kvartal: 4 }
  return { aar, kvartal: (kvartal - 1) as Kvartal }
}

const KVARTAL_SLUTT: Record<Kvartal, [number, number]> = {
  1: [3, 31],
  2: [6, 30],
  3: [9, 30],
  4: [12, 31],
}

/** Siste kalenderdag i et kvartal, som «YYYY-MM-DD». */
export function kvartalSlutt(aar: number, kvartal: Kvartal): string {
  const [mnd, dag] = KVARTAL_SLUTT[kvartal]
  return `${aar}-${String(mnd).padStart(2, '0')}-${String(dag).padStart(2, '0')}`
}

// ─── Formatering og parsing ────────────────────────────────────────────────

function endringTekst(endring: number | 'ny'): string {
  if (endring === 'ny') return 'ny'
  if (endring === 0) return '±0'
  return endring > 0 ? `+${grupperTusen(endring)}` : `-${grupperTusen(endring)}`
}

function parseEndring(s: string): number | 'ny' {
  if (s === 'ny') return 'ny'
  if (s === '±0') return 0
  if (s.startsWith('+')) return parseTall(s.slice(1))
  return -parseTall(s.slice(1)) // s starter med «-»
}

/** Serialiserer en rapport til blokk-teksten (uten hilsen foran). */
export function formaterFondsrapport(r: Fondsrapport): string {
  const header = `[Fondsrapport Q${r.kvartal} ${r.aar} · per ${isoTilDDMMYYYY(r.perDato)}]`
  const kontanterLinje =
    `Kontanter: ${heleKr(r.kontanter)} ` +
    `(Q${r.forrige.kvartal} ${r.forrige.aar}: ${heleKr(r.forrige.kontanter)})`
  const linjer = r.linjer.map(
    l => `${l.navn}: ${heleKr(l.belop)} (${endringTekst(l.endring)}) ~${l.ref}`,
  )
  return [header, kontanterLinje, ...linjer].join('\n')
}

/**
 * Parser en blokk-tekst til en Fondsrapport. Strengt — alt eller ingenting:
 * én linje som ikke matcher gjør hele blokken ugyldig (returnerer null),
 * fremfor å skippe linjen stille og vise en rapport med hull i.
 */
export function parseFondsrapport(blokk: string): Fondsrapport | null {
  const linjer = blokk.split('\n')
  if (linjer.length < 3) return null // header + kontanter + minst én andel

  const headerMatch = HEADER_RE.exec(linjer[0])
  if (!headerMatch) return null
  const [, kvartalStr, aarStr, dd, mm, yyyy] = headerMatch
  const perDato = ddmmyyyyTilIso(dd, mm, yyyy)

  const kontanterMatch = KONTANTER_RE.exec(linjer[1])
  if (!kontanterMatch) return null
  const [, kontanterStr, forrigeKvartalStr, forrigeAarStr, forrigeKontanterStr] = kontanterMatch

  const andelLinjer: FondsrapportLinje[] = []
  for (const rad of linjer.slice(2)) {
    const m = LINJE_RE.exec(rad)
    if (!m) return null
    const [, navn, belopStr, endringStr, ref] = m
    andelLinjer.push({ ref, navn, belop: parseTall(belopStr), endring: parseEndring(endringStr) })
  }
  if (andelLinjer.length === 0) return null

  return {
    aar: Number(aarStr),
    kvartal: Number(kvartalStr) as Kvartal,
    perDato,
    kontanter: parseTall(kontanterStr),
    forrige: {
      aar: Number(forrigeAarStr),
      kvartal: Number(forrigeKvartalStr) as Kvartal,
      kontanter: parseTall(forrigeKontanterStr),
    },
    linjer: andelLinjer,
  }
}

/**
 * Splitter et innleggsinnhold i hilsen (fritekst, admins egen tekst) og
 * blokk (rå tekst fra header-linjen og ut, ikke enda parset). Leter etter
 * SISTE linje som matcher header-mønsteret — blokken skal alltid stå sist,
 * men en hilsen kan i teorien inneholde en linje som ser ut som en header
 * (f.eks. sitert fra en tidligere rapport); siste treff er alltid den
 * ekte blokk-starten.
 */
export function splittFondsrapport(innhold: string): { hilsen: string; blokk: string | null } {
  const linjer = innhold.split('\n')
  let headerIndex = -1
  for (let i = 0; i < linjer.length; i++) {
    if (HEADER_RE.test(linjer[i])) headerIndex = i
  }
  if (headerIndex === -1) return { hilsen: innhold, blokk: null }

  const hilsenLinjer = linjer.slice(0, headerIndex)
  // Den blanke linjen som skiller hilsen fra blokk hører ikke til hilsenen.
  while (hilsenLinjer.length > 0 && hilsenLinjer[hilsenLinjer.length - 1] === '') {
    hilsenLinjer.pop()
  }
  return { hilsen: hilsenLinjer.join('\n'), blokk: linjer.slice(headerIndex).join('\n') }
}

/**
 * Eneste inngang for UI-et: gitt et innleggsinnhold, gir denne enten
 * `null` (ingen gyldig fondsrapport-blokk — kortet skal ikke tegnes) eller
 * hilsenen + den parsede rapporten.
 */
export function lesFondsrapport(
  innhold: string | null,
): { hilsen: string; rapport: Fondsrapport } | null {
  if (!innhold) return null
  const { hilsen, blokk } = splittFondsrapport(innhold)
  if (!blokk) return null
  const rapport = parseFondsrapport(blokk)
  if (!rapport) return null
  return { hilsen, rapport }
}

// ─── Bygging ────────────────────────────────────────────────────────────

/** Rådata for fond_innskudd-raden — kun feltene byggFondsrapport-grunnlaget trenger. */
export type FondInnskuddRad = {
  profilId: string
  dato: string // «YYYY-MM-DD»
  oppsparAkkumulert: number // kroner, kan ha desimaler
  renteandelIFjor: number // kroner, kan ha desimaler
}

export type FondBevegelseRad = {
  profilId: string
  dato: string // «YYYY-MM-DD»
  belop: number // kroner, fortegnsbærende, kan ha desimaler
}

/**
 * Fallback for «forrige rapport» når det ikke finnes en publisert rapport å
 * sammenligne mot (typisk kun for den aller første fondsrapporten). Regner
 * ut hva rapporten for `kvartalSlutt` sitt kvartal VILLE vist, ut fra
 * fondsdataene appen allerede har.
 *
 * Kaster hvis en innskuddsrads eget år (rad.dato) avviker fra
 * kvartalSlutt sitt år — bevegelsene og oppspart_akkumulert/renteandel_i_fjor
 * er begge årsbundne tall, og å blande dem på tvers av år ville gitt et tall
 * uten mening (se issue #785 og fond_bevegelse-migrasjonen).
 */
export function forrigeFraFondsdata({
  innskudd,
  bevegelser,
  kvartalSlutt: kvartalSluttDato,
}: {
  innskudd: FondInnskuddRad[]
  bevegelser: FondBevegelseRad[]
  kvartalSlutt: string
}): ForrigeGrunnlag {
  const kvartalSluttAar = Number(kvartalSluttDato.slice(0, 4))
  const perProfilOere: Record<string, number> = {}

  for (const rad of innskudd) {
    const radAar = Number(rad.dato.slice(0, 4))
    if (radAar !== kvartalSluttAar) {
      throw new Error(
        `Kvartalsslutten ${kvartalSluttDato} ligger i et annet år enn oppgjøret ${rad.dato} for ${rad.profilId}`,
      )
    }
    const bevegelseSumOere = bevegelser
      .filter(
        b =>
          b.profilId === rad.profilId &&
          b.dato <= kvartalSluttDato &&
          Number(b.dato.slice(0, 4)) === radAar,
      )
      .reduce((s, b) => s + Math.round(b.belop * 100), 0)

    const oere =
      Math.round(rad.oppsparAkkumulert * 100) + Math.round(rad.renteandelIFjor * 100) + bevegelseSumOere
    perProfilOere[rad.profilId] = (perProfilOere[rad.profilId] ?? 0) + oere
  }

  const totalOere = Object.values(perProfilOere).reduce((s, v) => s + v, 0)
  const { aar, kvartal } = kvartalFor(kvartalSluttDato)
  return { aar, kvartal, kontanter: Math.round(totalOere / 100), perProfilOere }
}

/**
 * Bygger den frosne rapporten fra et øyeblikksbilde av fondsdataene.
 * Avrunder til hele kroner FØR endringen regnes ut (ikke omvendt) — ellers
 * kunne to avrundinger (23,6 → 24 nå, 22,4 → 22 før) gitt en endring som
 * ikke stemmer med differansen mellom de VISTE tallene.
 *
 * Kaster ved ref-kollisjon: to profil-id-er med samme
 * FONDSRAPPORT_REF_LENGDE-tegns slutt (se refFor) ville vært umulig å skille i
 * teksten — usannsynlig på klubbens skala, men skal stoppe publiseringen
 * synlig fremfor å publisere en tvetydig rapport.
 */
export function byggFondsrapport({
  aar,
  kvartal,
  perDato,
  saldo,
  andeler,
  forrige,
}: {
  aar: number
  kvartal: Kvartal
  perDato: string
  saldo: number
  andeler: { profilId: string; navn: string; belopOere: number }[]
  forrige: ForrigeGrunnlag
}): Fondsrapport {
  const brukteRefs = new Map<string, string>() // ref -> profilId

  const linjer: FondsrapportLinje[] = andeler.map(a => {
    const ref = refFor(a.profilId)
    const eierAvRef = brukteRefs.get(ref)
    if (eierAvRef && eierAvRef !== a.profilId) {
      throw new Error(`Fondsrapport: ref-kollisjon "${ref}" mellom to innskytere`)
    }
    brukteRefs.set(ref, a.profilId)

    const belop = Math.round(a.belopOere / 100)
    const forrigeOere = forrige.perProfilOere[a.profilId]
    const endring: number | 'ny' =
      forrigeOere === undefined || forrigeOere === 0 ? 'ny' : belop - Math.round(forrigeOere / 100)

    return { ref, navn: a.navn, belop, endring }
  })

  linjer.sort((a, b) => b.belop - a.belop || a.navn.localeCompare(b.navn, 'nb'))

  return {
    aar,
    kvartal,
    perDato,
    kontanter: Math.round(saldo),
    forrige: { aar: forrige.aar, kvartal: forrige.kvartal, kontanter: forrige.kontanter },
    linjer,
  }
}

// ─── Visningshjelpere (brukt av FondsrapportBlokk) ────────────────────────

/** «< 1 %» når andelen er over 0 men runder til 0 %, ellers hele prosent. */
export function andelTekst(andelPst: number): string {
  const avrundet = Math.round(andelPst)
  if (avrundet === 0 && andelPst > 0) return '<1 %'
  return `${avrundet} %`
}

/** Prosentendring fra `forrige` til `naa`. Null når `forrige` er 0 (udefinert endring). */
export function endringPst(naa: number, forrige: number): number | null {
  if (forrige === 0) return null
  return ((naa - forrige) / forrige) * 100
}

export type KontantEndring = {
  /** 'uendret' er egen tilstand: 0 kr skal ikke tegnes som grønn ▲ «+0 %». */
  retning: 'opp' | 'ned' | 'uendret'
  /** Første linje i pillen, uten pil: «1 234 kr» eller «±0 kr». */
  belop: string
  /** Andre linje: «+5 % siden Q2», eller bare «siden Q2» når prosent ikke gir mening. */
  sammenligning: string
}

/**
 * Endringspillen på kortet — to linjer, så pillen blir smal nok til at
 * smultringen får plass ved siden av saldoen. Null-sjekken går på AVRUNDET
 * beløp, så en endring som vises som «0 kr» aldri får farge eller pil.
 * Minus i prosent er U+2212.
 */
export function kontantEndring(naa: number, forrige: number, forrigeKvartal: Kvartal): KontantEndring {
  const diff = naa - forrige
  const siden = `siden Q${forrigeKvartal}`
  if (Math.round(diff) === 0) {
    return { retning: 'uendret', belop: '±0 kr', sammenligning: siden }
  }
  // Forrige saldo 0 gir udefinert prosent — da står bare «siden Qn».
  const pst = endringPst(naa, forrige)
  const sammenligning = pst === null ? siden : `${pst >= 0 ? '+' : '−'}${Math.round(Math.abs(pst))} % ${siden}`
  return { retning: diff > 0 ? 'opp' : 'ned', belop: heleKr(Math.abs(diff)), sammenligning }
}

/**
 * Farge-token for eier nummer `i` (0-indeksert, i sortert rekkefølge).
 * De første FONDSRAPPORT_EGNE_FARGER eierne får hver sin farge; resten
 * deler siste (nøytrale) token — se app/globals.css § Fondsrapport.
 */
export function fargeToken(i: number): string {
  return `var(--fond-farge-${Math.min(i, FONDSRAPPORT_EGNE_FARGER) + 1})`
}
