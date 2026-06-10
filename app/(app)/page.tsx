import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { getInnloggetBruker } from '@/lib/auth-cache'
import { formaterDato, norskAar, norskDatoNaa } from '@/lib/dato'
import { subMonths } from 'date-fns'
import SectionLabel from '@/components/ui/SectionLabel'
import PushPaaminnelse from './PushPaaminnelse'
import HighlightKort from '@/components/agenda/HighlightKort'
import ArrangementKort from '@/components/agenda/ArrangementKort'
import UtkastKort from '@/components/agenda/UtkastKort'
import BursdagKort from '@/components/agenda/BursdagKort'
import KlubbJubileumKort from '@/components/agenda/KlubbJubileumKort'
import InnspillKnapp from '@/components/agenda/InnspillKnapp'
import PollKort from '@/components/agenda/PollKort'
import MeldingKort from '@/components/agenda/MeldingKort'
import NyFAB from '@/components/agenda/NyFAB'
import RsvpInline from '@/components/agenda/RsvpInline'
import type { KommentarKortData } from '@/components/agenda/KommentarerPaaKort'
import {
  byggAgenda,
  type ArrangementRaad,
  type UtkastRaad,
  type ProfilMedBursdag,
  type PollRaad,
  type MeldingRaad,
} from '@/lib/agenda-sortering'
import { hentPollStemmerAggregatBatch } from '@/lib/queries/poll'
import { AGENDA_VINDU_MND } from '@/lib/konstanter'
import { ALBUM_SPOTLIGHT_SELECT, tilAlbumSpotlight } from '@/lib/melding-spotlight'

// Agenda-forsiden: henter rådata og delegerer all sortering/gruppering til
// lib/agenda-sortering.ts. Denne filen skal holdes tynn — kun fetch + render.
export default async function Forside() {
  const [user, supabase] = await Promise.all([
    getInnloggetBruker(),
    createServerClient(),
  ])

  const naa = norskDatoNaa()
  // Felles cutoff for alle element-typer på forsiden: AGENDA_VINDU_MND måneder
  // tilbake. Eldre vises via /tidligere (full historikk, paginert). Issue #176.
  const cutoff = subMonths(new Date(), AGENDA_VINDU_MND)
  const cutoffIso = cutoff.toISOString()
  const aar = norskAar()

  const [
    { data: arrangementer },
    { data: profilerMedBursdag },
    { data: ansvar },
    { data: pollerRaad },
    { data: arrKommentarer },
    { data: pollKommentarer },
    { data: meldingerRaad },
    { data: meldingReaksjoner },
    { data: meldingKommentarer },
    { data: albumMedArrangement },
    { data: aktiveProfiler },
  ] = await Promise.all([
    // arrangement_chat(count) gir totalt kommentarantall per arr via PostgREST
    // embed — erstatter den separate id-only-spørringen vi hadde før (#180).
    supabase
      .from('arrangementer')
      .select(
        `id, type, tittel, start_tidspunkt, oppmoetested, bilde_url,
         paameldinger (profil_id, status, profiles (visningsnavn, bilde_url, rolle)),
         arrangement_chat (count)`,
      )
      .gte('start_tidspunkt', cutoffIso)
      .order('start_tidspunkt', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, visningsnavn, fodselsdato, bilde_url, rolle')
      .eq('aktiv', true)
      .not('fodselsdato', 'is', null),
    supabase
      .from('arrangoransvar')
      .select('arrangement_navn, purredato, ansvarlig_id, profiles (visningsnavn)')
      .eq('aar', aar)
      .is('arrangement_id', null),
    // poll_chat(count) gir totalt kommentarantall per poll via PostgREST
    // embed — erstatter den separate id-only-spørringen vi hadde før (#180).
    supabase
      .from('poll')
      .select(
        `id, spoersmaal, svarfrist, flervalg, opprettet_av,
         kaaring_mal_id, aar, avsluttet_paa, tiebreak_status,
         poll_valg (id, tekst, rekkefoelge),
         poll_stemme (profil_id, valg_id),
         poll_chat (count)`,
      )
      .gte('svarfrist', cutoffIso)
      .order('svarfrist', { ascending: true }),
    // Siste kommentarer per arrangement og poll — vises inline på hvert kort.
    // Henter siste 30 per tabell innenfor samme 12-mnd-vindu (cutoffIso) som
    // arrangementer og polls. 30 rader dekker ~10 arrangementer med 3
    // kommentarer hver — godt nok for det som er synlig på agenda.
    supabase
      .from('arrangement_chat')
      .select(
        `id, innhold, bilde_url, opprettet, arrangement_id,
         profiles (navn, bilde_url, rolle)`,
      )
      .gte('opprettet', cutoffIso)
      .order('opprettet', { ascending: false })
      .limit(30),
    supabase
      .from('poll_chat')
      .select(
        `id, innhold, bilde_url, opprettet, poll_id,
         profiles (navn, bilde_url, rolle)`,
      )
      .gte('opprettet', cutoffIso)
      .order('opprettet', { ascending: false })
      .limit(30),
    // Meldinger (#90, fjerde element-type). Vi henter relativt åpent (60)
    // for å fange både levende og de som er falt ned i Tidligere.
    // FK-navn må spesifiseres på profiles-embed siden melding_reaksjon
    // og melding_chat også har FK til profiles — uten det får vi
    // «more than one relationship» fra PostgREST.
    supabase
      .from('meldinger')
      .select(
        // melding_chat(count) returnerer aggregert antall kommentarer per
        // melding via PostgREST — billig og uavhengig av om den enkelte
        // kommentaren faller innenfor melding_chat-limit-vinduet under.
        // Album-spotlight (#214): album + spotlight-bilde embed-es via
        // ALBUM_SPOTLIGHT_SELECT så samme select brukes alle steder.
        `id, innhold, opprettet, sist_aktivitet, fra_facebook, profil_id,
         profiles!meldinger_profil_id_fkey (navn, bilde_url, rolle),
         melding_bilder (bilde_url, rekkefoelge),
         melding_chat (count),
         ${ALBUM_SPOTLIGHT_SELECT}`,
      )
      .gte('sist_aktivitet', cutoffIso)
      .order('sist_aktivitet', { ascending: false }),
    // Dato-filter så reaksjoner følger samme 12-mnd-vindu som resten (#180).
    // Pragmatisk match mot agendaens 12-mnd-vindu — godt nok så lenge selve
    // meldinger-funksjonen er nyere enn 12 mnd. Edge-case: melding med
    // opprettet >12 mnd men sist_aktivitet <12 mnd kan miste gamle reaksjoner.
    // Materialiseres tidligst ~mai 2027; forsiden viser kun 12-mnd uansett.
    supabase
      .from('melding_reaksjon')
      .select('melding_id, profil_id, emoji')
      .gte('opprettet', cutoffIso),
    // Dato-filter + limit — følger samme cutoff-vindu som resten (#180).
    supabase
      .from('melding_chat')
      .select(
        'id, innhold, bilde_url, opprettet, melding_id, profiles!melding_chat_profil_id_fkey (navn, bilde_url, rolle)',
      )
      .gte('opprettet', cutoffIso)
      .order('opprettet', { ascending: false })
      .limit(60),
    // Hvilke arrangementer har album — brukes til både kamera-ikon på
    // agenda-kortet og som fallback-bilde når arrangementet ikke har eget
    // bilde_url. Vi henter cover via FK-join (album_cover_fk) + bilde-antall
    // via aggregat, ikke hele bildelista. Fallback-bilde brukes kun når
    // cover er eksplisitt satt — uten cover får arrangementet kamera-ikon
    // men beholder placeholder-stilen.
    supabase
      .from('album')
      .select(
        'arrangement_id, cover:album_bilde!album_cover_fk (bilde_url), antall:album_bilde!album_bilde_album_id_fkey (count)',
      )
      .not('arrangement_id', 'is', null),
    // Aktive profiler — sendes til kortene for @mention-forslag i inline
    // kommentar-felt. Samme select-form som /chat-siden bruker.
    supabase
      .from('profiles')
      .select('id, navn, bilde_url, rolle')
      .eq('aktiv', true),
  ])

  // Kåringspoll-aggregater hentes via RPC (mig. 079), fordi RLS skjuler
  // andres stemmer for vanlige medlemmer på åpne kåringspoller. For
  // vanlige polls bruker vi poll_stemme-radene direkte slik som før.
  const kaaringspollIder = (pollerRaad ?? [])
    .filter(p => p.kaaring_mal_id !== null)
    .map(p => p.id)
  const kaaringAggregater = await hentPollStemmerAggregatBatch(supabase, kaaringspollIder)

  // Aggreger poll-stemmer: antall unike profiler + om innlogget bruker er
  // blant dem, + hvilke valg jeg har stemt på. Valgene sorteres etter
  // rekkefølge så inline-knappene rendres i opprettet rekkefølge.
  const poller: PollRaad[] = (pollerRaad ?? []).map(p => {
    const stemmer = (p.poll_stemme ?? []) as { profil_id: string; valg_id: string }[]
    const unike = new Set(stemmer.map(s => s.profil_id))
    const mine = stemmer.filter(s => s.profil_id === user!.id).map(s => s.valg_id)
    const valg = [...(p.poll_valg ?? [])]
      .sort((a, b) => a.rekkefoelge - b.rekkefoelge)
      .map(v => ({ id: v.id, tekst: v.tekst }))

    const erKaaring = p.kaaring_mal_id !== null
    const stemmerPerValg: Record<string, number> = {}
    let antallStemmer = 0

    if (erKaaring) {
      // Aggregat fra RPC — totalen er sannheten siden RLS skjuler andres
      // stemmer. harStemt utledes fortsatt fra poll_stemme: egne stemmer
      // er synlige for kalleren.
      const agg = kaaringAggregater.get(p.id) ?? new Map<string, number>()
      for (const [valgId, antall] of agg) {
        stemmerPerValg[valgId] = antall
        antallStemmer += antall
      }
    } else {
      for (const s of stemmer) {
        stemmerPerValg[s.valg_id] = (stemmerPerValg[s.valg_id] ?? 0) + 1
      }
      antallStemmer = unike.size
    }

    return {
      id: p.id,
      spoersmaal: p.spoersmaal,
      svarfrist: p.svarfrist,
      flervalg: p.flervalg,
      opprettet_av: p.opprettet_av,
      antallStemmer,
      harStemt: unike.has(user!.id),
      valg,
      mineStemmer: mine,
      stemmerPerValg,
    }
  })

  // Grupper kommentarer per arrangement/poll-id, ta top 3. Siden queryen
  // allerede er sortert synkende på opprettet, tar vi bare de første 3 per
  // gruppe — men reverserer rekkefølgen så eldste vises øverst (leser
  // kommentarene i kronologisk rekkefølge).
  type RawArrKomm = {
    id: string
    innhold: string | null
    bilde_url: string | null
    opprettet: string
    arrangement_id: string
    profiles: { navn: string | null; bilde_url: string | null; rolle: string | null } | null
  }
  type RawPollKomm = {
    id: string
    innhold: string | null
    bilde_url: string | null
    opprettet: string
    poll_id: string
    profiles: { navn: string | null; bilde_url: string | null; rolle: string | null } | null
  }

  function grupperKommentarer<T extends { id: string; innhold: string | null; bilde_url: string | null; opprettet: string; profiles: RawArrKomm['profiles'] }>(
    rader: T[],
    nokkel: (r: T) => string,
  ): Map<string, KommentarKortData[]> {
    const map = new Map<string, KommentarKortData[]>()
    for (const r of rader) {
      if (!r.profiles) continue
      const k = nokkel(r)
      const list = map.get(k) ?? []
      if (list.length >= 3) continue
      list.push({
        id: r.id,
        innhold: r.innhold,
        bilde_url: r.bilde_url,
        opprettet: r.opprettet,
        avsender: {
          navn: r.profiles.navn ?? 'Ukjent',
          bilde_url: r.profiles.bilde_url,
          rolle: r.profiles.rolle,
        },
      })
      map.set(k, list)
    }
    // Reverser så eldste vises øverst (kronologisk lesing)
    for (const [k, v] of map) map.set(k, v.reverse())
    return map
  }

  const kommentarerPerArr = grupperKommentarer(
    (arrKommentarer ?? []) as unknown as RawArrKomm[],
    r => r.arrangement_id,
  )
  const kommentarerPerPoll = grupperKommentarer(
    (pollKommentarer ?? []) as unknown as RawPollKomm[],
    r => r.poll_id,
  )

  // === Meldinger: bygg MeldingRaad med reaksjoner og kommentar-antall =
  type RawMeldKomm = {
    id: string
    innhold: string | null
    bilde_url: string | null
    opprettet: string
    melding_id: string
    profiles: { navn: string | null; bilde_url: string | null; rolle: string | null } | null
  }
  const kommentarerPerMelding = grupperKommentarer(
    (meldingKommentarer ?? []) as unknown as RawMeldKomm[],
    r => r.melding_id,
  )

  // Totalt antall kommentarer per arrangement — hentet fra arrangement_chat(count)-
  // embed på arrangementer-spørringen (#180). Samme mønster som melding_chat(count).
  // PostgREST returnerer [{ count: N }] per rad; vi leser [0]?.count ?? 0.
  type RawArrMedCount = {
    id: string
    arrangement_chat: { count: number }[] | null
  }
  const totaltPerArr = new Map<string, number>()
  for (const a of (arrangementer ?? []) as unknown as RawArrMedCount[]) {
    totaltPerArr.set(a.id, a.arrangement_chat?.[0]?.count ?? 0)
  }

  // Totalt antall kommentarer per poll — hentet fra poll_chat(count)-embed
  // på poll-spørringen (#180). Samme mønster som over.
  type RawPollMedCount = {
    id: string
    poll_chat: { count: number }[] | null
  }
  const totaltPerPoll = new Map<string, number>()
  for (const p of (pollerRaad ?? []) as unknown as RawPollMedCount[]) {
    totaltPerPoll.set(p.id, p.poll_chat?.[0]?.count ?? 0)
  }

  type RawAlbumEmbed = {
    id: string
    tittel: string
    cover: { bilde_url: string; thumb_url: string | null } | { bilde_url: string; thumb_url: string | null }[] | null
    antall: { count: number }[] | null
  } | null
  type RawSpotlightEmbed = { bilde_url: string; thumb_url: string | null } | { bilde_url: string; thumb_url: string | null }[] | null

  type RawMelding = {
    id: string
    innhold: string | null
    opprettet: string
    sist_aktivitet: string
    fra_facebook: boolean | null
    profil_id: string
    profiles: { navn: string | null; bilde_url: string | null; rolle: string | null } | null
    melding_bilder: { bilde_url: string; rekkefoelge: number }[] | null
    melding_chat: { count: number }[] | null
    album: RawAlbumEmbed | RawAlbumEmbed[]
    spotlight: RawSpotlightEmbed
  }

  // antallKommentarer per melding kommer nå fra count-aggregatet på selve
  // meldinger-spørringen (melding_chat(count)), ikke fra meldingKommentarer
  // (limit 60). Det fixer regresjonen som oppsto da vi fjernet limit(60) på
  // meldinger: før hadde vi praktisk talt total dekning fordi begge limit'ene
  // var 60, men med 75 historiske FB-meldinger holdt det ikke. count-aggregat
  // er pålitelig uansett vindu.
  const antallKommPerMelding = new Map<string, number>()
  for (const m of (meldingerRaad ?? []) as unknown as RawMelding[]) {
    antallKommPerMelding.set(m.id, m.melding_chat?.[0]?.count ?? 0)
  }

  // Aggreger reaksjoner per melding+emoji
  type RawReaksjon = { melding_id: string; profil_id: string; emoji: string }
  const reaksjonerPerMelding = new Map<string, Map<string, string[]>>()
  for (const r of (meldingReaksjoner ?? []) as RawReaksjon[]) {
    const perEmoji = reaksjonerPerMelding.get(r.melding_id) ?? new Map<string, string[]>()
    const profilIder = perEmoji.get(r.emoji) ?? []
    profilIder.push(r.profil_id)
    perEmoji.set(r.emoji, profilIder)
    reaksjonerPerMelding.set(r.melding_id, perEmoji)
  }

  const meldingerForAgenda: MeldingRaad[] = (meldingerRaad ?? []).map((m: RawMelding) => {
    const reaksjonMap = reaksjonerPerMelding.get(m.id) ?? new Map()
    const reaksjoner = [...reaksjonMap.entries()].map(([emoji, profilIder]) => ({
      emoji,
      profilIder,
    }))
    // Alle bilder er nå i melding_bilder — bilde_url-kolonnen er droppet (#174)
    const bilder = [...(m.melding_bilder ?? [])]
      .sort((a, b) => a.rekkefoelge - b.rekkefoelge)
      .map(b => b.bilde_url)
    return {
      id: m.id,
      innhold: m.innhold,
      opprettet: m.opprettet,
      sist_aktivitet: m.sist_aktivitet,
      bilder,
      fraFacebook: m.fra_facebook === true,
      forfatter: {
        id: m.profil_id,
        navn: m.profiles?.navn ?? 'Ukjent',
        bilde_url: m.profiles?.bilde_url ?? null,
        rolle: m.profiles?.rolle ?? null,
      },
      reaksjoner,
      antallKommentarer: antallKommPerMelding.get(m.id) ?? 0,
      albumSpotlight: tilAlbumSpotlight(m.album, m.spotlight),
    }
  })

  // Album-info per arrangement: finnes album med ≥1 bilde, og er det satt
  // cover? cover kommer som ett embedded objekt via album_cover_fk; antall
  // som ett aggregat-objekt ([{count}]).
  type AlbumIndikator = {
    arrangement_id: string | null
    cover: { bilde_url: string } | { bilde_url: string }[] | null
    antall: { count: number }[] | null
  }
  const arrangementMedAlbum = new Set<string>()
  const coverPerArrangement = new Map<string, string>()
  for (const a of (albumMedArrangement ?? []) as AlbumIndikator[]) {
    if (!a.arrangement_id) continue
    const antall = a.antall?.[0]?.count ?? 0
    if (antall === 0) continue
    arrangementMedAlbum.add(a.arrangement_id)
    const cover = Array.isArray(a.cover) ? a.cover[0] : a.cover
    if (cover?.bilde_url) coverPerArrangement.set(a.arrangement_id, cover.bilde_url)
  }

  const arrangementerBerikt = ((arrangementer ?? []) as unknown as ArrangementRaad[]).map(a => ({
    ...a,
    harAlbum: arrangementMedAlbum.has(a.id),
    // Fall tilbake til album-cover hvis arr ikke har eget bilde
    bilde_url: a.bilde_url ?? coverPerArrangement.get(a.id) ?? null,
  }))

  const { ubesvarte, meldinger, idag, kommende, tidligere } = byggAgenda({
    arrangementer: arrangementerBerikt,
    ansvar: (ansvar ?? []) as unknown as UtkastRaad[],
    profilerMedBursdag: (profilerMedBursdag ?? []) as ProfilMedBursdag[],
    poller,
    meldinger: meldingerForAgenda,
    meg: user!.id,
    naa,
    aar,
  })

  const chatProfiler = aktiveProfiler ?? []

  // Header viser dagens norske dato: ukedag (eyebrow), dato (h1), "I dag" (label).
  // Følger M5-referansen fra #190.
  const naaIso = new Date().toISOString()
  const ukedag = formaterDato(naaIso, 'EEEE')
  const idagDato = formaterDato(naaIso, 'd. MMMM')

  return (
    <div style={{ padding: '0 20px 20px' }}>
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 12,
          marginBottom: 26,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--text-tertiary)',
              letterSpacing: '2.5px',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            {ukedag}
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontStyle: 'italic',
              fontSize: 44,
              fontWeight: 400,
              letterSpacing: '-1px',
              lineHeight: 1,
              margin: 0,
              color: 'var(--text-primary)',
            }}
          >
            {idagDato}
          </h1>
        </div>

        <NyFAB />
      </header>

      <PushPaaminnelse />

      {/* Ubesvarte fremtidige arrangementer — vises øverst som påminnelse (#271).
          Hvert kort er en vanlig <Link> med en RsvpInline-rad rett under.
          RsvpInline ligger *utenfor* <Link> for å unngå nested-button-i-link-feil.
          Arrangementet forsvinner herfra (og dukker opp i Kommende/I kveld) så
          snart revalidatePath('/') kjøres etter at svaret er lagret. */}
      {ubesvarte.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <SectionLabel>Ikke svart ennå</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {ubesvarte.map(i => {
              if (i.kind !== 'arrangement') return null
              return (
                // Wrapper med overflow:hidden klipper bort bunnavrunding på kortet
                // og lar RsvpInline fylle ut bunnen — de to elementene ser da ut
                // som ett sammenhengende kort (#271).
                <div
                  key={i.data.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: 'var(--radius-card)',
                    overflow: 'hidden',
                    // Accent-outline + halo signaliserer "her må du gjøre noe" (#275)
                    border: '1px solid var(--accent)',
                    boxShadow: '0 0 0 4px var(--accent-soft)',
                  }}
                >
                  <ArrangementKort
                    arr={i.data}
                    visKommentarer={false}
                  />
                  {/* RsvpInline sitter utenfor <Link> i ArrangementKort slik at
                      knapp-klikk ikke trigger navigasjon. Wrapperens overflow:hidden
                      sørger for at bunnavrundingen kuttes riktig. */}
                  <RsvpInline arrangementId={i.data.id} />
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Levende meldinger — fjerde element-type, øverst på agenda */}
      {meldinger.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <SectionLabel>Nytt fra gutta</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {meldinger.map(i => {
              if (i.kind !== 'melding') return null
              return (
                <MeldingKort
                  key={i.data.id}
                  melding={i.data}
                  brukerId={user!.id}
                  kommentarer={kommentarerPerMelding.get(i.data.id) ?? []}
                  profiler={chatProfiler}
                />
              )
            })}
          </div>
        </section>
      )}

      {/* I kveld */}
      {idag.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <SectionLabel>
            I kveld · {formaterDato(idag[0].sortIso!, 'd. MMMM').toLowerCase()}
          </SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {idag.map(i => {
              if (i.kind === 'highlight') return <HighlightKort key={i.data.id} arr={i.data} />
              if (i.kind === 'bursdag') return <BursdagKort key={i.data.id} bursdag={i.data} />
              if (i.kind === 'klubbjubileum') return <KlubbJubileumKort key={i.data.id} jubileum={i.data} />
              if (i.kind === 'utkast') return <UtkastKort key={i.data.id} utkast={i.data} meg={user!.id} />
              if (i.kind === 'poll')
                return <PollKort key={i.data.id} poll={i.data} kommentarer={kommentarerPerPoll.get(i.data.id) ?? []} totaltKommentarer={totaltPerPoll.get(i.data.id) ?? 0} profiler={chatProfiler} brukerId={user!.id} />
              if (i.kind === 'arrangement')
                return <ArrangementKort key={i.data.id} arr={i.data} kommentarer={kommentarerPerArr.get(i.data.id) ?? []} totaltKommentarer={totaltPerArr.get(i.data.id) ?? 0} profiler={chatProfiler} brukerId={user!.id} />
              // Meldinger plasseres kun i toppseksjonen (eller Tidligere) — ikke her
              return null
            })}
          </div>
        </section>
      )}

      {/* Kommende */}
      <section style={{ marginBottom: 20 }}>
        <SectionLabel>Kommende</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {kommende.map(i => {
            if (i.kind === 'arrangement')
              return <ArrangementKort key={i.data.id} arr={i.data} kommentarer={kommentarerPerArr.get(i.data.id) ?? []} totaltKommentarer={totaltPerArr.get(i.data.id) ?? 0} profiler={chatProfiler} brukerId={user!.id} />
            if (i.kind === 'bursdag') return <BursdagKort key={i.data.id} bursdag={i.data} />
            if (i.kind === 'klubbjubileum') return <KlubbJubileumKort key={i.data.id} jubileum={i.data} />
            if (i.kind === 'utkast') return <UtkastKort key={i.data.id} utkast={i.data} meg={user!.id} />
            if (i.kind === 'poll')
              return <PollKort key={i.data.id} poll={i.data} kommentarer={kommentarerPerPoll.get(i.data.id) ?? []} totaltKommentarer={totaltPerPoll.get(i.data.id) ?? 0} profiler={chatProfiler} brukerId={user!.id} />
            if (i.kind === 'highlight') return <HighlightKort key={i.data.id} arr={i.data} />
            // Meldinger plasseres kun i toppseksjonen eller Tidligere
            return null
          })}
          {kommende.length === 0 && (
            <p
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--text-tertiary)',
                letterSpacing: '0.5px',
                margin: '8px 0',
              }}
            >
              Ingen planlagte sammenkomster.
            </p>
          )}
        </div>
      </section>

      {/* Innspill */}
      <InnspillKnapp />

      {/* Tidligere */}
      {tidligere.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <SectionLabel>Tidligere</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {tidligere.map(t => {
              if (t.kind === 'arrangement')
                return <ArrangementKort key={t.data.id} arr={t.data} tidligere />
              if (t.kind === 'poll') return <PollKort key={t.data.id} poll={t.data} tidligere />
              return <MeldingKort key={t.data.id} melding={t.data} brukerId={user!.id} />
            })}
          </div>
          <Link
            href="/tidligere"
            style={{
              display: 'block',
              marginTop: 16,
              padding: '10px 14px',
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '1.4px',
              textTransform: 'uppercase',
              color: 'var(--accent)',
              border: '0.5px solid var(--border)',
              borderRadius: 999,
              textDecoration: 'none',
            }}
          >
            Se hele historikken →
          </Link>
        </section>
      )}
    </div>
  )
}
