// Agenda-sortering — all logikk for hvordan forsiden grupperer og sorterer.
// page.tsx henter kun rådata og rendrer resultatet.
//
// Typer brukeren kan opprette (NyFAB): møte og tur (arrangement.type), poll og
// melding (#90). Utkast, bursdag og klubbjubileum er avledet fra annen data.
//
// Seksjoner, i prioritert rekkefølge:
//   bursdagerIDag — bursdager på samme Oslo-dag som naa, løftet over alt annet,
//                   også «Ikke svart ennå» (#640). Ekskludert fra idag.
//   ubesvarte     — kommende arrangementer uten påmeldingsrad for meg (#271).
//                   Ekskludert fra idag/kommende.
//   meldinger     — levende/festede meldinger, se erMeldingLevende()/erFestet().
//   idag          — sortIso på samme Oslo-dag som naa.
//   kommende      — resten, stigende; utkast uten purredato til slutt.
//   tidligere     — passerte arrangementer/polls + meldinger som har falt ned,
//                   synkende. En tur MED sluttid blir i kommende til sluttiden
//                   passerer (erPaagaaende(), #766); møter har aldri sluttid.
//
// sortIso per type:
//   arrangement — start_tidspunkt
//   bursdag     — {dato}T12:00Z: midt på dagen, så Oslo/UTC-forskyvning
//                 aldri flytter den til nabodagen
//   utkast      — purredato + T12:00Z, ellers null. Passert purredato havner
//                 øverst i kommende med vilje: glemte utkast skal synes.
//   poll        — svarfrist
//   melding     — sist_aktivitet

import type { HighlightKortData } from '@/components/agenda/HighlightKort'
import type { ArrangementKortData, AvreiseData } from '@/components/agenda/ArrangementKort'
import type { UtkastData } from '@/components/agenda/UtkastKort'
import type { BursdagData } from '@/components/agenda/BursdagKort'
import type { KlubbJubileumData } from '@/components/agenda/KlubbJubileumKort'
import type { PollKortData } from '@/components/agenda/PollKort'
import type { MeldingKortData } from '@/components/agenda/MeldingKort'
import type { AlbumKort } from '@/lib/melding-album'
import { KLUBB_STIFTET } from '@/lib/klubb-config'
import { AVREISE_VINDU_DAGER } from '@/lib/konstanter'
import { norskDag, erPaaOsloDag, osloDagNokkel } from '@/lib/dato'
import { differenceInCalendarDays } from 'date-fns'

// Fallback når agendaen ikke får stiftelsesdatoen admin har satt.
export const STIFTET_DATO = KLUBB_STIFTET

// En melding er «levende» (øverst) så lenge siste aktivitet er nyere enn dette.
// sist_aktivitet bumpes av kommentarer, ikke av reaksjoner — de er for lette.
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
  // PÅKREVD med vilje (#766): en glemt select skal være byggefeil, ikke en tur
  // som stille faller til Tidligere ved start_tidspunkt.
  slutt_tidspunkt: string | null
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
  // Bursdagsbilde-embedet (#641), allerede filtrert til dagens feiringsdato og
  // status='ferdig' i lib/queries/agenda.ts. Array fordi PostgREST returnerer
  // embeds slik.
  //
  // PÅKREVD med vilje: en feilstavet embed-alias blir en EKSTRA
  // SelectQueryError-nøkkel, ikke en manglende — var feltet valgfritt, ville
  // typoen passert kompilering og bare vist seg som et borte bilde i prod.
  bursdagsbilde: { bilde_url: string | null }[] | null
}

// Poll + aggregater, hentet i én spørring med join (ingen N+1).
export type PollRaad = {
  id: string
  spoersmaal: string
  svarfrist: string
  flervalg: boolean
  opprettet_av: string
  antallStemmer: number
  harStemt: boolean
  // For inline-stemming og -resultat på kortet.
  valg: { id: string; tekst: string }[]
  mineStemmer: string[]
  stemmerPerValg: Record<string, number>
}

// Meldinger (#90) med forfatter og aggregater, så MeldingKort slipper ekstra
// queries. sist_aktivitet vedlikeholdes av DB-trigger.
export type MeldingRaad = {
  id: string
  innhold: string | null
  opprettet: string
  sist_aktivitet: string
  // Sortert stigende på rekkefoelge (#174).
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
  // Satt = innlegget lenker til et album, og omslaget erstatter egne bilder (#214, #463).
  albumKort: AlbumKort | null
  // Satt av forfatter/admin for å flytte innlegget til Tidligere umiddelbart (mig. 099).
  arkivert_tidspunkt: string | null
  // Festedato; >= i dag = festet øverst uavhengig av levetid (mig. 109, #419).
  aktuell_dato: string | null
}

// === Resultat-typer ===============================================

// `kind` lar forsiden velge kort-komponent. Arrangementer i dag tagges som
// 'highlight', ellers 'arrangement', så forsiden ikke dupliserer beslutningen.
export type AgendaItem =
  | { kind: 'highlight'; sortIso: string; data: HighlightKortData }
  | { kind: 'arrangement'; sortIso: string; data: ArrangementKortData }
  | { kind: 'utkast'; sortIso: string | null; data: UtkastData }
  | { kind: 'bursdag'; sortIso: string; data: BursdagData }
  | { kind: 'klubbjubileum'; sortIso: string; data: KlubbJubileumData }
  | { kind: 'poll'; sortIso: string; data: PollKortData }
  | { kind: 'melding'; sortIso: string; data: MeldingKortData }

export type TidligereItem =
  | { kind: 'arrangement'; sortIso: string; data: ArrangementKortData }
  | { kind: 'poll'; sortIso: string; data: PollKortData }
  | { kind: 'melding'; sortIso: string; data: MeldingKortData }

export type Agenda = {
  ubesvarte: AgendaItem[]
  meldinger: AgendaItem[]
  bursdagerIDag: AgendaItem[]
  idag: AgendaItem[]
  kommende: AgendaItem[]
  tidligere: TidligereItem[]
}

// === Helpers (eksportert for test og gjenbruk) ====================

// Hero-kortet for i dag, med forhåndsvisning av opptil tre ja-deltakere.
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

// `tidligere` demper kortet og skjuler reaksjoner og kommentarfelt.
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
    albumKort: m.albumKort,
    tidligere,
  }
}

export function erMeldingLevende(m: MeldingRaad, naa: Date): boolean {
  const dag = 24 * 60 * 60 * 1000
  const aktivitetAlder = naa.getTime() - new Date(m.sist_aktivitet).getTime()
  return aktivitetAlder <= MELDING_LEVENDE_DAGER * dag
}

// Festet = aktuell_dato >= i dag og ikke arkivert (#419). Strengsammenligning
// holder fordi YYYY-MM-DD sorterer leksikografisk.
export function erFestet(m: MeldingRaad, naa: Date): boolean {
  if (!m.aktuell_dato || m.arkivert_tidspunkt) return false
  return m.aktuell_dato >= osloDagNokkel(naa)
}

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

// Tur med sluttid som ikke er passert (#766). Møter har alltid null sluttid
// (constraint tur_felt_kun_for_tur, mig. 002).
export function erPaagaaende(arr: ArrangementRaad, naaIso: string): boolean {
  return arr.slutt_tidspunkt !== null && arr.slutt_tidspunkt >= naaIso
}

// Avreise-blokka på tur-kortet (#669), eller null. Kun turer (møter har ingen
// reise), kun framover («5 dager igjen» etter avreise er feil, og /tidligere
// skal ikke ha den), og kun innenfor vinduet. `naa` sendes inn for testbarhet.
function byggAvreise(
  arr: ArrangementRaad,
  jaListe: PaameldingRaad[],
  naa: Date,
): AvreiseData | null {
  if (arr.type !== 'tur') return null

  // Begge sider er allerede lokale Oslo-kalenderdag-Dates (`naa` fra
  // norskDatoNaa()). Ikke send `naa` gjennom norskDag() — det er dobbelt.
  const dagerIgjen = differenceInCalendarDays(norskDag(arr.start_tidspunkt), naa)
  if (dagerIgjen < 0 || dagerIgjen > AVREISE_VINDU_DAGER) return null

  return {
    dagerIgjen,
    // Navnløse rader droppes: «?»-avatarer sier ingenting om hvem som blir med.
    deltakere: jaListe
      .map(p => ({
        navn: p.profiles?.visningsnavn ?? '',
        src: p.profiles?.bilde_url ?? null,
        rolle: p.profiles?.rolle ?? null,
      }))
      .filter(d => d.navn),
  }
}

// Kompakt kort for kommende og tidligere. Uten `naa` bygges ingen avreise-blokk
// — /tidligere kaller uten og sparer RSC-payload for kort i fortida.
export function tilKort(arr: ArrangementRaad, meg: string, naa?: Date): ArrangementKortData {
  const jaListe = arr.paameldinger.filter(p => p.status === 'ja')
  const min = arr.paameldinger.find(p => p.profil_id === meg)
  const avreise = naa ? byggAvreise(arr, jaListe, naa) : null
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
    ...(avreise ? { avreise } : {}),
  }
}

// Bursdager fra `naa` til `naa + dagerFremover`. Sjekker også neste år, så en
// januar-bursdag dukker opp i desember. Profiler uten dato eller navn droppes.
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
          // Koblet via embedet på profilen, aldri via `dato` over: `dato` er
          // literal MM-DD, mens embedet er filtrert på faktisk feiringsdato
          // (skuddårsregelen i lib/bursdag.ts). For 29. februar divergerer de (#641).
          generertBildeUrl: p.bursdagsbilde?.[0]?.bilde_url ?? null,
        })
      }
    }
  }
  return items
}

// Neste stiftelsesdag innenfor vinduet, eller null. Sjekker også neste år.
export function beregnKlubbJubileum(
  naa: Date,
  dagerFremover: number,
  stiftet: { aar: number; maaned: number; dag: number } = STIFTET_DATO,
): KlubbJubileumData | null {
  const slutt = new Date(naa.getFullYear(), naa.getMonth(), naa.getDate() + dagerFremover)
  for (const aar of [naa.getFullYear(), naa.getFullYear() + 1]) {
    const jubdag = new Date(aar, stiftet.maaned - 1, stiftet.dag)
    if (jubdag >= naa && jubdag <= slutt) {
      return {
        id: `klubbjubileum-${aar}`,
        dato: `${aar}-${String(stiftet.maaned).padStart(2, '0')}-${String(stiftet.dag).padStart(2, '0')}`,
        alder: aar - stiftet.aar,
      }
    }
  }
  return null
}

// Grupperer arrangoransvar-rader uten arrangement til ett utkast per
// arrangement_navn, med alle ansvarlige i DB-rekkefølge.
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

// `naa` er en Oslo-kalenderdag som lokal Date (norskDatoNaa()), sendt inn så
// «i dag» kan styres i tester.
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
  /** Stiftelsesdatoen admin har satt (lib/klubb-info.ts). Utelatt = klubb-config. */
  stiftet?: { aar: number; maaned: number; dag: number }
}): Agenda {
  const { arrangementer, ansvar, profilerMedBursdag, meg, naa, aar } = input
  const poller = input.poller ?? []
  const meldingerRaad = input.meldinger ?? []
  const bursdagsvinduDager = input.bursdagsvinduDager ?? 365
  const nowIso = new Date().toISOString()

  // === Meldinger ====================================================
  // Levende = ikke arkivert OG (festet ELLER innenfor levetiden). Arkiverte
  // går til Tidligere uansett alder (#312, #419).
  const levendeRaad = meldingerRaad.filter(
    m => !m.arkivert_tidspunkt && (erFestet(m, naa) || erMeldingLevende(m, naa)),
  )
  const ikkeLevendeRaad = meldingerRaad.filter(
    m => !!m.arkivert_tidspunkt || (!erFestet(m, naa) && !erMeldingLevende(m, naa)),
  )

  // Festede øverst, den som utløper først først; likt → nyeste aktivitet.
  const festede = levendeRaad
    .filter(m => erFestet(m, naa))
    .sort((a, b) => {
      const datoDiff = (a.aktuell_dato ?? '').localeCompare(b.aktuell_dato ?? '')
      if (datoDiff !== 0) return datoDiff
      return b.sist_aktivitet.localeCompare(a.sist_aktivitet)
    })

  const oevrige = levendeRaad
    .filter(m => !erFestet(m, naa))
    .sort((a, b) => b.sist_aktivitet.localeCompare(a.sist_aktivitet))

  const meldinger: AgendaItem[] = [...festede, ...oevrige].map(m => ({
    kind: 'melding' as const,
    sortIso: m.sist_aktivitet,
    data: tilMeldingKort(m, false),
  }))

  const tidligereMelding: TidligereItem[] = ikkeLevendeRaad.map(m => ({
    kind: 'melding' as const,
    // Arkiverte sorteres på arkiveringstidspunktet, så de legger seg øverst
    // rett etter Arkiver. Samme uttrykk som den genererte kolonnen
    // sorterings_tidspunkt (mig. 120) — endres regelen, må BEGGE oppdateres.
    // Forsiden leser ikke kolonnen fordi den ikke keyset-paginerer (#491).
    sortIso: m.arkivert_tidspunkt ?? m.sist_aktivitet,
    data: tilMeldingKort(m, true),
  }))

  // Tidligere = startet før nå OG ikke på samme Oslo-dag (ellers forsvinner
  // kveldens arrangement fra «i dag» samme kveld) OG ikke pågående.
  const tidligereArr: TidligereItem[] = arrangementer
    .filter(
      a =>
        !erPaaOsloDag(a.start_tidspunkt, naa) &&
        a.start_tidspunkt < nowIso &&
        !erPaagaaende(a, nowIso),
    )
    .sort((a, b) => b.start_tidspunkt.localeCompare(a.start_tidspunkt))
    .map(a => ({
      kind: 'arrangement' as const,
      sortIso: a.start_tidspunkt,
      data: tilKort(a, meg),
    }))

  // Nedre grense styres av AGENDA_VINDU_MND i spørringen (#176).
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

  const bursdager = beregnBursdager(profilerMedBursdag, naa, bursdagsvinduDager)

  // Id-formatet `utkast-{aar}-{tittel}` hindrer React-key-kollisjon med arrangement-ids.
  const utkast = bygUtkast(ansvar, aar)

  // Ubesvart = ingen rad i paameldinger for meg (#271). Sjekker rad-eksistens,
  // ikke status: status er NOT NULL, så !min.status ville bare maskert
  // ugyldige rader. Også dagens ubesvarte havner her, ikke som highlight —
  // brukeren skal svare, ikke glede seg.
  const ubesvarte: AgendaItem[] = arrangementer
    .filter(a => {
      // Etter start er det for sent å si ja.
      if (a.start_tidspunkt < nowIso) return false
      const min = a.paameldinger.find(p => p.profil_id === meg)
      return !min
    })
    .sort((a, b) => a.start_tidspunkt.localeCompare(b.start_tidspunkt))
    .map(a => ({
      kind: 'arrangement' as const,
      sortIso: a.start_tidspunkt,
      data: tilKort(a, meg, naa),
    }))

  const ubesvarteIds = new Set(ubesvarte.map(i => i.data.id))

  const arrItems: AgendaItem[] = arrangementer
    .filter(a => {
      if (ubesvarteIds.has(a.id)) return false
      return (
        a.start_tidspunkt >= nowIso ||
        erPaaOsloDag(a.start_tidspunkt, naa) ||
        erPaagaaende(a, nowIso)
      )
    })
    .map(a => {
      const erIdag = erPaaOsloDag(a.start_tidspunkt, naa)
      return erIdag
        ? { kind: 'highlight', sortIso: a.start_tidspunkt, data: tilHighlight(a, meg) }
        : { kind: 'arrangement', sortIso: a.start_tidspunkt, data: tilKort(a, meg, naa) }
    })

  const bursdagItems: AgendaItem[] = bursdager.map(b => ({
    kind: 'bursdag',
    sortIso: `${b.dato}T12:00:00.000Z`,
    data: b,
  }))

  const jubileum = beregnKlubbJubileum(naa, bursdagsvinduDager, input.stiftet)
  const jubileumItems: AgendaItem[] = jubileum
    ? [{ kind: 'klubbjubileum', sortIso: `${jubileum.dato}T12:00:00.000Z`, data: jubileum }]
    : []

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

  const pollItems: AgendaItem[] = poller
    .filter(p => p.svarfrist >= nowIso || erPaaOsloDag(p.svarfrist, naa))
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

  const idagAlle = alleItems.filter(i => i.sortIso && erPaaOsloDag(i.sortIso, naa))

  const bursdagerIDag = idagAlle.filter(i => i.kind === 'bursdag')
  const idag = idagAlle.filter(i => i.kind !== 'bursdag')

  // Items uten sortIso (utkast uten purredato) dyttes til slutten.
  const kommende = alleItems
    .filter(i => !(i.sortIso && erPaaOsloDag(i.sortIso, naa)))
    .sort((a, b) => {
      if (!a.sortIso) return 1
      if (!b.sortIso) return -1
      return a.sortIso.localeCompare(b.sortIso)
    })

  return { ubesvarte, meldinger, bursdagerIDag, idag, kommende, tidligere }
}
