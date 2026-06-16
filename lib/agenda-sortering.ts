// Agenda-sortering — all logikk for hvordan forsiden grupperer og sorterer
// elementene. page.tsx skal kun hente rådata og rendre resultatet; ingen
// kategorisering eller mapping i selve ruten.
//
// === De fire element-typene brukeren kan opprette ====================
// Disse er valgene i NyFAB-menyen og styrer hvilke kort-komponenter som
// brukes på agenda. I tillegg har agendaen avledede typer (utkast, bursdag,
// klubbjubileum) som beregnes fra annen data.
//
//   1. Møte        — arrangement.type = 'moete'    → ArrangementKort/HighlightKort
//   2. Tur         — arrangement.type = 'tur'      → ArrangementKort/HighlightKort
//   3. Poll        — egen tabell `poll`            → PollKort
//   4. Melding     — egen tabell `meldinger`       → MeldingKort  (ny — #90)
//
// === Seksjons-regler (i prioritert rekkefølge) =======================
//   0. «Meldinger»  = levende meldinger (se MELDING_LEVENDE_DAGER
//                     under). Plassert øverst på
//                     agenda, sortert etter sist_aktivitet (nyeste først).
//   1. «I kveld»    = items hvis sortIso faller på samme norske dag som naa
//   2. «Kommende»   = alt annet som ikke er tidligere (sortert stigende
//                     på sortIso, utkast uten purredato faller til enden)
//   3. «Tidligere»  = arrangementer/polls som har passert + meldinger som
//                     har «falt ned» (sortert synkende — nyeste øverst)
//
// === sortIso-bygging per type ========================================
//   - arrangement : start_tidspunkt (UTC ISO fra DB)
//   - bursdag     : {dato}T12:00:00.000Z (midt på dagen UTC for å unngå
//                   tidssone-drift mellom Oslo og UTC)
//   - utkast      : purredato + T12:00:00Z. Passerte purredato havner
//                   naturlig øverst i «Kommende» pga stigende sortering —
//                   det er bevisst, glemte utkast skal være synlige. Hvis
//                   purredato mangler → null (enden av lista).
//   - poll        : svarfrist
//   - melding     : sist_aktivitet (driver både live-sortering og
//                   tidligere-sortering)
//
// «Samme norske dag»-sjekk gjøres eksplisitt via Intl.DateTimeFormat med
// Europe/Oslo for å håndtere at et arrangement klokka 00:30 UTC fortsatt
// tilhører «i kveld» norsk tid hvis det er samme dato etter konvertering.

import type { HighlightKortData } from '@/components/agenda/HighlightKort'
import type { ArrangementKortData } from '@/components/agenda/ArrangementKort'
import type { UtkastData } from '@/components/agenda/UtkastKort'
import type { BursdagData } from '@/components/agenda/BursdagKort'
import type { KlubbJubileumData } from '@/components/agenda/KlubbJubileumKort'
import type { PollKortData } from '@/components/agenda/PollKort'
import type { MeldingKortData } from '@/components/agenda/MeldingKort'
import type { AlbumSpotlight } from '@/lib/melding-spotlight'
import { KLUBB_STIFTET } from '@/lib/klubb-config'

// Stiftelsesdato — brukes til å beregne neste jubileumsdag på agendaen.
// Hentes fra klubb-config slik at den kan overstyres via env-var.
export const STIFTET_DATO = KLUBB_STIFTET

// Levetidsregler for meldinger på agenda. En melding er «levende» (vises
// øverst) så lenge det er mindre enn MELDING_LEVENDE_DAGER siden siste
// aktivitet. sist_aktivitet starter ved opprettelse og bumpes av nye
// kommentarer (ikke reaksjoner — de er for lette).
export const MELDING_LEVENDE_DAGER = 3.5

// === Rådata-typer (speiler Supabase-queryene i forsiden) ==========

export type PaameldingRaad = {
  profil_id: string
  status: string
  profiles: {
    visningsnavn: string | null
    bilde_url: string | null
    rolle?: string | null
  } | null
}

export type ArrangementRaad = {
  id: string
  type: string
  tittel: string
  start_tidspunkt: string
  oppmoetested: string | null
  bilde_url: string | null
  paameldinger: PaameldingRaad[]
  harAlbum?: boolean
}

export type UtkastRaad = {
  arrangement_navn: string
  purredato: string | null
  ansvarlig_id: string | null
  profiles: { visningsnavn: string | null } | null
}

export type ProfilMedBursdag = {
  id: string
  visningsnavn: string | null
  fodselsdato: string | null
  bilde_url?: string | null
  rolle?: string | null
}

// Rådata fra poll-tabellen + aggregater hentet av forsiden. Forsiden gjør
// én query mot poll med join til poll_valg (for count) og poll_stemme
// (for unike stemmere og min-stemt-sjekk). Dette er én spørring — ingen N+1.
export type PollRaad = {
  id: string
  spoersmaal: string
  svarfrist: string
  flervalg: boolean
  opprettet_av: string
  antallStemmer: number
  harStemt: boolean
  // Alternativer + egne stemmer følger med så kortet kan rendre inline-
  // stemming når valg.length er lavt nok. Tomme felter er ok for eldre
  // callsites (f.eks. tester som ikke bruker poll).
  valg: { id: string; tekst: string }[]
  mineStemmer: string[]
  // Antall stemmer per valg-id — brukes til å vise resultat inline etter
  // at man har stemt.
  stemmerPerValg: Record<string, number>
}

// Rådata for meldinger (#90). Inneholder forfatter-info + aggregerte
// reaksjoner og kommentar-antall slik at MeldingKort ikke trenger ekstra
// queries. sist_aktivitet vedlikeholdes av DB-trigger ved INSERT på
// melding_chat eller melding_reaksjon.
export type MeldingRaad = {
  id: string
  innhold: string | null
  opprettet: string
  sist_aktivitet: string
  // Flat liste over bilde-URL-er, sortert stigende på rekkefoelge fra DB.
  // Erstatter bilde_url + tilleggsbilder etter migrasjonen i #174.
  bilder: string[]
  fraFacebook: boolean
  forfatter: {
    id: string
    navn: string
    bilde_url: string | null
    rolle: string | null
  }
  reaksjoner: { emoji: string; profilIder: string[] }[]
  antallKommentarer: number
  // Album-spotlight: hvis satt, er innlegget en lenke til et album
  // og spotlight-bildet erstatter ev. egne bilder. Se #214.
  albumSpotlight: AlbumSpotlight | null
  // Satt av forfatter/admin for å flytte innlegget til Tidligere umiddelbart.
  // Null = ikke arkivert. Mig. 099.
  arkivert_tidspunkt: string | null
}

// === Resultat-typer ===============================================

// Et item på agendaen. Hver variant har egen UI-data + felles sortIso.
// Tag-feltet `kind` lar forsiden velge riktig kort-komponent uten å gjette.
// Merk: arr-items i «I kveld» rendres som HighlightKort; i «Kommende» som
// ArrangementKort. Vi tagger dem forskjellig så forsiden ikke må duplisere
// beslutningen.
export type AgendaItem =
  | { kind: 'highlight'; sortIso: string; data: HighlightKortData }
  | { kind: 'arrangement'; sortIso: string; data: ArrangementKortData }
  | { kind: 'utkast'; sortIso: string | null; data: UtkastData }
  | { kind: 'bursdag'; sortIso: string; data: BursdagData }
  | { kind: 'klubbjubileum'; sortIso: string; data: KlubbJubileumData }
  | { kind: 'poll'; sortIso: string; data: PollKortData }
  | { kind: 'melding'; sortIso: string; data: MeldingKortData }

// Tidligere-seksjonen viser avsluttede arrangementer, avsluttede polls
// (sistnevnte i 30 dager etter svarfrist) og meldinger som ikke lenger
// er levende. Tagget union slik at render-koden kan velge kort-komponent.
export type TidligereItem =
  | { kind: 'arrangement'; sortIso: string; data: ArrangementKortData }
  | { kind: 'poll'; sortIso: string; data: PollKortData }
  | { kind: 'melding'; sortIso: string; data: MeldingKortData }

export type Agenda = {
  // Ubesvarte fremtidige arrangementer — øverst, over «I kveld» (#271).
  // Et arrangement er ubesvart når innlogget bruker ikke har status i paameldinger.
  // Disse ekskluderes fra idag/kommende for å unngå duplikat.
  ubesvarte: AgendaItem[]
  // Levende meldinger — øverst på agenda, sortert etter sist_aktivitet
  meldinger: AgendaItem[]
  idag: AgendaItem[]
  kommende: AgendaItem[]
  tidligere: TidligereItem[]
}

// Polls med svarfrist passert vises alltid i «tidligere» på forsiden
// (innenfor det generelle AGENDA_VINDU_MND-vinduet fra spørringen i page.tsx).

// === Helpers (eksportert for test og gjenbruk) ====================

// Returnerer true hvis ISO-tidspunktet faller på samme kalenderdag som
// `referanse`, tolket i Europe/Oslo. Brukes til å plassere arrangementer
// i «I kveld» selv om UTC-tidspunktet krysser midnatt.
export function erSammeNorskeDag(iso: string, referanse: Date): boolean {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const get = (t: string) => parts.find(p => p.type === t)?.value
  return (
    get('year') === String(referanse.getFullYear()) &&
    get('month') === String(referanse.getMonth() + 1).padStart(2, '0') &&
    get('day') === String(referanse.getDate()).padStart(2, '0')
  )
}

// Mapper et ArrangementRaad til HighlightKortData — brukes for «I kveld»-
// seksjonen som viser stor hero-stil med forhåndsvisning av ja-deltakere.
export function tilHighlight(arr: ArrangementRaad, meg: string): HighlightKortData {
  const jaListe = arr.paameldinger.filter(p => p.status === 'ja')
  const min = arr.paameldinger.find(p => p.profil_id === meg)
  return {
    id: arr.id,
    type: arr.type,
    tittel: arr.tittel,
    start_tidspunkt: arr.start_tidspunkt,
    oppmoetested: arr.oppmoetested,
    bilde_url: arr.bilde_url,
    antallJa: jaListe.length,
    deltakereForhand: jaListe
      .map(p => ({
        navn: p.profiles?.visningsnavn ?? '',
        src: p.profiles?.bilde_url ?? null,
        rolle: p.profiles?.rolle ?? null,
      }))
      .filter(d => d.navn)
      .slice(0, 3),
    minStatus: (min?.status as 'ja' | 'kanskje' | 'nei' | undefined) ?? null,
  }
}

// Mapper et MeldingRaad til MeldingKortData. Identitetsmapping —
// `tidligere`-feltet (boolean) styrer visuell dempning og skjuler
// reaksjoner og kommentarfelt på kortet.
export function tilMeldingKort(m: MeldingRaad, tidligere: boolean): MeldingKortData {
  return {
    id: m.id,
    innhold: m.innhold,
    opprettet: m.opprettet,
    sist_aktivitet: m.sist_aktivitet,
    bilder: m.bilder,
    fraFacebook: m.fraFacebook,
    forfatter: m.forfatter,
    reaksjoner: m.reaksjoner,
    antallKommentarer: m.antallKommentarer,
    albumSpotlight: m.albumSpotlight,
    tidligere,
  }
}

// Avgjør om en melding fortsatt skal vises som «levende» øverst på agenda.
// Levende = mindre enn MELDING_LEVENDE_DAGER siden siste kommentar (eller
// opprettelse, hvis ingen kommentarer). Reaksjoner teller ikke. Eksportert
// for test.
export function erMeldingLevende(m: MeldingRaad, naa: Date): boolean {
  const dag = 24 * 60 * 60 * 1000
  const aktivitetAlder = naa.getTime() - new Date(m.sist_aktivitet).getTime()
  return aktivitetAlder <= MELDING_LEVENDE_DAGER * dag
}

// Mapper et PollRaad til PollKortData. `avsluttet` styrer visningen —
// aktive polls viser "Du har stemt"/frist, avsluttede viser bare antall.
export function tilPollKort(p: PollRaad, avsluttet: boolean): PollKortData {
  return {
    id: p.id,
    spoersmaal: p.spoersmaal,
    svarfrist: p.svarfrist,
    flervalg: p.flervalg,
    antallStemmer: p.antallStemmer,
    harStemt: p.harStemt,
    avsluttet,
    valg: p.valg,
    mineStemmer: p.mineStemmer,
    stemmerPerValg: p.stemmerPerValg,
  }
}

// Mapper et ArrangementRaad til ArrangementKortData — kompakt kort brukt i
// «Kommende» og «Tidligere». Ingen deltaker-forhåndsvisning, bare antall ja.
export function tilKort(arr: ArrangementRaad, meg: string): ArrangementKortData {
  const jaListe = arr.paameldinger.filter(p => p.status === 'ja')
  const min = arr.paameldinger.find(p => p.profil_id === meg)
  return {
    id: arr.id,
    type: arr.type,
    tittel: arr.tittel,
    start_tidspunkt: arr.start_tidspunkt,
    oppmoetested: arr.oppmoetested,
    bilde_url: arr.bilde_url,
    antallJa: jaListe.length,
    minStatus: (min?.status as 'ja' | 'kanskje' | 'nei' | undefined) ?? null,
    harAlbum: arr.harAlbum ?? false,
  }
}

// Beregner kommende bursdager i et vindu fra `naa` til `naa + dagerFremover`.
// Går gjennom inneværende og neste kalenderår — dekker nyttårsovergang der
// en bursdag i januar skal dukke opp når vi står i desember.
// Profiler uten fødselsdato eller visningsnavn droppes.
export function beregnBursdager(
  profiler: ProfilMedBursdag[],
  naa: Date,
  dagerFremover: number,
): BursdagData[] {
  const items: BursdagData[] = []
  const slutt = new Date(naa.getFullYear(), naa.getMonth(), naa.getDate() + dagerFremover)
  for (const p of profiler) {
    if (!p.fodselsdato || !p.visningsnavn) continue
    const [fodselsaar, mnd, dag] = p.fodselsdato.split('-').map(Number)
    for (const aar of [naa.getFullYear(), naa.getFullYear() + 1]) {
      const bdag = new Date(aar, mnd - 1, dag)
      if (bdag >= naa && bdag <= slutt) {
        items.push({
          id: `bursdag-${p.id}-${aar}`,
          profilId: p.id,
          navn: p.visningsnavn,
          dato: `${aar}-${String(mnd).padStart(2, '0')}-${String(dag).padStart(2, '0')}`,
          alder: aar - fodselsaar,
          bildeUrl: p.bilde_url ?? null,
          rolle: p.rolle ?? null,
        })
      }
    }
  }
  return items
}

// Beregner neste klubbjubileum (stiftelsesdag) innenfor et vindu fra `naa`.
// Returnerer null hvis stiftelsesdagen faller utenfor vinduet. Sjekker både
// inneværende og neste kalenderår så nyttårsovergang håndteres riktig.
export function beregnKlubbJubileum(
  naa: Date,
  dagerFremover: number,
): KlubbJubileumData | null {
  const slutt = new Date(naa.getFullYear(), naa.getMonth(), naa.getDate() + dagerFremover)
  for (const aar of [naa.getFullYear(), naa.getFullYear() + 1]) {
    const jubdag = new Date(aar, STIFTET_DATO.maaned - 1, STIFTET_DATO.dag)
    if (jubdag >= naa && jubdag <= slutt) {
      return {
        id: `klubbjubileum-${aar}`,
        dato: `${aar}-${String(STIFTET_DATO.maaned).padStart(2, '0')}-${String(STIFTET_DATO.dag).padStart(2, '0')}`,
        alder: aar - STIFTET_DATO.aar,
      }
    }
  }
  return null
}

// Grupperer arrangoransvar-rader (uten arrangement_id) til utkast per
// `arrangement_navn`. Alle ansvarlige for arrangementet vises på utkastet
// i samme rekkefølge som de ligger i databasen.
function bygUtkast(
  ansvar: UtkastRaad[],
  aar: number,
): (UtkastData & { purredato: string | null })[] {
  const gruppering = new Map<
    string,
    { ansvarlige: string[]; ansvarligeIds: string[]; purredato: string | null }
  >()
  for (const rad of ansvar) {
    if (!gruppering.has(rad.arrangement_navn)) {
      gruppering.set(rad.arrangement_navn, {
        ansvarlige: [],
        ansvarligeIds: [],
        purredato: rad.purredato,
      })
    }
    const navn = rad.profiles?.visningsnavn
    const gruppe = gruppering.get(rad.arrangement_navn)!
    if (navn) gruppe.ansvarlige.push(navn)
    if (rad.ansvarlig_id) gruppe.ansvarligeIds.push(rad.ansvarlig_id)
  }
  return [...gruppering.entries()].map(
    ([tittel, { ansvarlige, ansvarligeIds, purredato }]) => ({
      id: `utkast-${aar}-${tittel}`,
      tittel,
      malNavn: tittel,
      aar,
      ansvarlige,
      ansvarligeIds,
      purredato,
    }),
  )
}

// === Hovedfunksjon ================================================

// Bygger den komplette agendaen fra rådata. All kategorisering og sortering
// skjer her; forsiden rendrer kun resultatet. `naa` passes inn slik at
// «i dag»-bestemmelsen kan styres eksplisitt (og testes).
export function byggAgenda(input: {
  arrangementer: ArrangementRaad[]
  ansvar: UtkastRaad[]
  profilerMedBursdag: ProfilMedBursdag[]
  poller?: PollRaad[]
  meldinger?: MeldingRaad[]
  meg: string
  naa: Date
  aar: number
  bursdagsvinduDager?: number
}): Agenda {
  const { arrangementer, ansvar, profilerMedBursdag, meg, naa, aar } = input
  const poller = input.poller ?? []
  const meldingerRaad = input.meldinger ?? []
  const bursdagsvinduDager = input.bursdagsvinduDager ?? 365
  const nowIso = new Date().toISOString()

  // === Type 4: Meldinger ============================================
  // Splittes i levende (øverst) og tidligere. Levende sorteres på
  // sist_aktivitet desc — nye kommentarer dytter den opp (reaksjoner teller
  // ikke, se mig. 060).
  //
  // En melding er levende KUN hvis den er innenfor tidsvinduet OG ikke
  // arkivert. Arkiverte meldinger havner i Tidligere uansett alder. (#312)
  const levendeRaad = meldingerRaad.filter(
    m => erMeldingLevende(m, naa) && !m.arkivert_tidspunkt,
  )
  const ikkeLevendeRaad = meldingerRaad.filter(
    m => !erMeldingLevende(m, naa) || !!m.arkivert_tidspunkt,
  )

  const meldinger: AgendaItem[] = levendeRaad
    .map(m => ({
      kind: 'melding' as const,
      sortIso: m.sist_aktivitet,
      data: tilMeldingKort(m, false),
    }))
    .sort((a, b) => b.sortIso.localeCompare(a.sortIso))

  const tidligereMelding: TidligereItem[] = ikkeLevendeRaad.map(m => ({
    kind: 'melding' as const,
    // Arkiverte meldinger sorteres på arkiveringstidspunkt — de legger seg
    // øverst i Tidligere rett etter at brukeren trykker Arkiver. Ikke-
    // arkiverte bruker sist_aktivitet som før.
    sortIso: m.arkivert_tidspunkt ?? m.sist_aktivitet,
    data: tilMeldingKort(m, true),
  }))

  // Regel 3: Tidligere = ekte arrangementer som både ligger før nå i UTC
  // *og* ikke faller på samme norske dag som naa. Den andre betingelsen
  // hindrer at et arrangement klokka 17:00 norsk tid havner under «Tidligere»
  // senere samme kveld.
  const tidligereArr: TidligereItem[] = arrangementer
    .filter(a => !erSammeNorskeDag(a.start_tidspunkt, naa) && a.start_tidspunkt < nowIso)
    .sort((a, b) => b.start_tidspunkt.localeCompare(a.start_tidspunkt))
    .map(a => ({
      kind: 'arrangement' as const,
      sortIso: a.start_tidspunkt,
      data: tilKort(a, meg),
    }))

  // Avsluttede polls (svarfrist passert) vises i tidligere-seksjonen.
  // Nedre grense styres nå av AGENDA_VINDU_MND-filteret i page.tsx —
  // ingen lokal 30-dagers grense her lenger (se issue #176).
  const tidligerePoll: TidligereItem[] = poller
    .filter(p => p.svarfrist < nowIso)
    .map(p => ({
      kind: 'poll' as const,
      sortIso: p.svarfrist,
      data: tilPollKort(p, true),
    }))

  const tidligere: TidligereItem[] = [
    ...tidligereArr,
    ...tidligerePoll,
    ...tidligereMelding,
  ].sort((a, b) => b.sortIso.localeCompare(a.sortIso))

  // Bursdager innen standardvinduet (default 365 dager fremover).
  const bursdager = beregnBursdager(profilerMedBursdag, naa, bursdagsvinduDager)

  // Utkast fra arrangoransvar. Disse har eget id-format `utkast-{aar}-{tittel}`
  // slik at React-keyene ikke kolliderer med arrangement-ids.
  const utkast = bygUtkast(ansvar, aar)

  // Samlet kandidat-liste for «I kveld» + «Kommende». Arrangementer tas kun
  // med hvis de enten er i fremtiden eller samme norske dag (dekker kveld
  // som begynner før midnatt UTC men går over i neste UTC-dag).
  //
  // Ubesvarte fremtidige arrangementer (#271): arrangement der innlogget bruker
  // (meg) ikke har noen rad i paameldinger. Disse plasseres i en egen seksjon
  // øverst og ekskluderes fra idag/kommende for å unngå duplikat.
  // «I kveld»-arrangementer som er ubesvart, vises likevel i ubesvart-seksjonen
  // (ikke som highlight) — brukeren skal svare, ikke «glede seg» til kvelden.
  const ubesvarte: AgendaItem[] = arrangementer
    .filter(a => {
      // Kun arrangementer som ennå ikke har startet — etter start_tidspunkt
      // er det for sent å si Ja, så da forsvinner det fra «Ikke svart».
      if (a.start_tidspunkt < nowIso) return false
      // Ubesvart = ingen rad i paameldinger for meg. DB-kolonnen status er
      // NOT NULL, så !min.status ville maskert evt. ugyldige rader heller enn
      // å rapportere dem — vi sjekker kun rad-eksistens her.
      const min = a.paameldinger.find(p => p.profil_id === meg)
      return !min
    })
    .sort((a, b) => a.start_tidspunkt.localeCompare(b.start_tidspunkt))
    .map(a => ({
      kind: 'arrangement' as const,
      sortIso: a.start_tidspunkt,
      data: tilKort(a, meg),
    }))

  // Sett med id-er som allerede er i ubesvart — ekskluderes fra idag/kommende
  const ubesvarteIds = new Set(ubesvarte.map(i => i.data.id))

  const arrItems: AgendaItem[] = arrangementer
    .filter(a => {
      if (ubesvarteIds.has(a.id)) return false // allerede i ubesvart
      return a.start_tidspunkt >= nowIso || erSammeNorskeDag(a.start_tidspunkt, naa)
    })
    .map(a => {
      const erIdag = erSammeNorskeDag(a.start_tidspunkt, naa)
      // I kveld → highlight-variant, ellers kompakt kort
      return erIdag
        ? { kind: 'highlight', sortIso: a.start_tidspunkt, data: tilHighlight(a, meg) }
        : { kind: 'arrangement', sortIso: a.start_tidspunkt, data: tilKort(a, meg) }
    })

  // Bursdager: sortIso = midt på dagen UTC. Dette plasserer dem tryggt
  // på riktig kalenderdag uansett hvordan localeCompare tolker sonene.
  const bursdagItems: AgendaItem[] = bursdager.map(b => ({
    kind: 'bursdag',
    sortIso: `${b.dato}T12:00:00.000Z`,
    data: b,
  }))

  // Klubbjubileum: samme sortIso-mønster som bursdager. Maks én per agenda.
  const jubileum = beregnKlubbJubileum(naa, bursdagsvinduDager)
  const jubileumItems: AgendaItem[] = jubileum
    ? [{ kind: 'klubbjubileum', sortIso: `${jubileum.dato}T12:00:00.000Z`, data: jubileum }]
    : []

  // Utkast: purredato styrer plassering direkte. Passerte purredato havner
  // naturlig øverst i «Kommende» pga stigende sortering — det er bevisst,
  // slik at glemte utkast holder seg synlige. Mangler purredato → null →
  // faller til enden via null-dytt-regelen.
  const utkastItems: AgendaItem[] = utkast.map(u => {
    const sortIso = u.purredato ? `${u.purredato}T12:00:00.000Z` : null
    return {
      kind: 'utkast',
      sortIso,
      data: {
        id: u.id,
        tittel: u.tittel,
        malNavn: u.malNavn,
        aar: u.aar,
        ansvarlige: u.ansvarlige,
        ansvarligeIds: u.ansvarligeIds,
      },
    }
  })

  // Aktive polls (svarfrist i fremtid eller samme norske dag) vises i
  // «i kveld»/«kommende». sortIso = svarfrist.
  const pollItems: AgendaItem[] = poller
    .filter(p => p.svarfrist >= nowIso || erSammeNorskeDag(p.svarfrist, naa))
    .map(p => ({
      kind: 'poll',
      sortIso: p.svarfrist,
      data: tilPollKort(p, false),
    }))

  const alleItems: AgendaItem[] = [
    ...arrItems,
    ...bursdagItems,
    ...jubileumItems,
    ...utkastItems,
    ...pollItems,
  ]

  // Regel 1: I kveld = items med sortIso som ligger på samme norske dag.
  const idag = alleItems.filter(i => i.sortIso && erSammeNorskeDag(i.sortIso, naa))

  // Regel 2: Kommende = resten, sortert stigende. Items uten sortIso (utkast
  // uten gyldig purredato) sorteres til enden via null-dytt-regelen.
  const kommende = alleItems
    .filter(i => !(i.sortIso && erSammeNorskeDag(i.sortIso, naa)))
    .sort((a, b) => {
      if (!a.sortIso) return 1
      if (!b.sortIso) return -1
      return a.sortIso.localeCompare(b.sortIso)
    })

  return { ubesvarte, meldinger, idag, kommende, tidligere }
}
