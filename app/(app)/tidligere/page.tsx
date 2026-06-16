// Full historikk — alle arrangementer/meldinger/polls i fortid, paginert med
// opaque cursor. Overlapper bevisst med agenda-vinduet på forsiden. De tre
// typene pagineres uavhengig med keyset og merges sortert synkende på
// (sortIso, id). Issue #176.

import { ensureInnlogget } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { TIDLIGERE_SIDESTOERRELSE } from '@/lib/konstanter'
import { dekodeCursor, enkodeCursor } from '@/lib/tidligere-cursor'
import { tilKort, tilMeldingKort, tilPollKort } from '@/lib/agenda-sortering'
import type { TidligereItem, MeldingRaad } from '@/lib/agenda-sortering'
import { hentPollStemmerAggregatBatch } from '@/lib/queries/poll'
import { ALBUM_SPOTLIGHT_SELECT, tilAlbumSpotlight } from '@/lib/melding-spotlight'
import { naa } from '@/lib/dato'
import { kanAdministrere } from '@/lib/roller'
import ArrangementKort from '@/components/agenda/ArrangementKort'
import PollKort from '@/components/agenda/PollKort'
import MeldingKort from '@/components/agenda/MeldingKort'
import SectionLabel from '@/components/ui/SectionLabel'
import Link from 'next/link'
import { ChevronLeftIcon } from '@heroicons/react/24/outline'

export const dynamic = 'force-dynamic'

export default async function TidligereSide({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>
}) {
  const { user } = await ensureInnlogget()
  const supabase = await createServerClient()
  const { cursor: cursorStr } = await searchParams
  const cursor = dekodeCursor(cursorStr)

  // Innlogget brukers rolle — styrer om av-arkiver-knappen vises på andres
  // innlegg (admin kan av-arkivere alle, ellers kun egne). (#312)
  const { data: minProfil } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const erAdmin = kanAdministrere(minProfil?.rolle ?? null)

  const grense = TIDLIGERE_SIDESTOERRELSE + 1 // hent én ekstra for å sjekke om det er mer

  // === Arrangementer ===
  let arrQuery = supabase
    .from('arrangementer')
    .select(
      'id, type, tittel, start_tidspunkt, oppmoetested, bilde_url, paameldinger (profil_id, status, profiles (visningsnavn, bilde_url, rolle))',
    )
    .lt('start_tidspunkt', naa())
    .order('start_tidspunkt', { ascending: false })
    .order('id', { ascending: false })
    .limit(grense)

  if (cursor.a) {
    // Keyset: vis kun rader eldre enn cursoren (synkende på start_tidspunkt, id)
    arrQuery = arrQuery.or(
      `start_tidspunkt.lt.${cursor.a[0]},and(start_tidspunkt.eq.${cursor.a[0]},id.lt.${cursor.a[1]})`,
    )
  }

  // === Meldinger ===
  let meldQuery = supabase
    .from('meldinger')
    .select(
      `id, innhold, opprettet, sist_aktivitet, arkivert_tidspunkt, fra_facebook, profil_id,
       profiles!meldinger_profil_id_fkey (navn, bilde_url, rolle),
       melding_bilder (bilde_url, rekkefoelge),
       melding_chat (count),
       ${ALBUM_SPOTLIGHT_SELECT}`,
    )
    .order('sist_aktivitet', { ascending: false })
    .order('id', { ascending: false })
    .limit(grense)

  if (cursor.m) {
    // Keyset: vis kun rader med eldre sist_aktivitet enn cursoren
    meldQuery = meldQuery.or(
      `sist_aktivitet.lt.${cursor.m[0]},and(sist_aktivitet.eq.${cursor.m[0]},id.lt.${cursor.m[1]})`,
    )
  }

  // === Polls ===
  // kaaring_mal_id må med for å skille kåringspoller (hvor RLS skjuler andres
  // stemmer) fra vanlige polls — samme mønster som forsiden bruker. Uten dette
  // blir antallStemmer/stemmerPerValg feil på kåringspoller for vanlige
  // medlemmer fordi `poll_stemme`-rader er filtrert av RLS (mig. 076).
  let pollQuery = supabase
    .from('poll')
    .select(
      'id, spoersmaal, svarfrist, flervalg, opprettet_av, kaaring_mal_id, poll_valg (id, tekst, rekkefoelge), poll_stemme (profil_id, valg_id)',
    )
    .lt('svarfrist', naa()) // kun avsluttede polls (.lt utelukker null implisitt)
    .order('svarfrist', { ascending: false })
    .order('id', { ascending: false })
    .limit(grense)

  if (cursor.p) {
    // Keyset: vis kun polls med eldre svarfrist enn cursoren
    pollQuery = pollQuery.or(
      `svarfrist.lt.${cursor.p[0]},and(svarfrist.eq.${cursor.p[0]},id.lt.${cursor.p[1]})`,
    )
  }

  const [{ data: arrRaad }, { data: meldRaad }, { data: pollRaad }] = await Promise.all([
    arrQuery,
    meldQuery,
    pollQuery,
  ])

  // Sjekk om det finnes mer (vi hentet grense = 30+1 rader)
  const harMerArr = (arrRaad?.length ?? 0) > TIDLIGERE_SIDESTOERRELSE
  const harMerMeld = (meldRaad?.length ?? 0) > TIDLIGERE_SIDESTOERRELSE
  const harMerPoll = (pollRaad?.length ?? 0) > TIDLIGERE_SIDESTOERRELSE

  // Klipp til TIDLIGERE_SIDESTOERRELSE (fjern den ekstra raden)
  const arrSide = (arrRaad ?? []).slice(0, TIDLIGERE_SIDESTOERRELSE)
  const meldSide = (meldRaad ?? []).slice(0, TIDLIGERE_SIDESTOERRELSE)
  const pollSide = (pollRaad ?? []).slice(0, TIDLIGERE_SIDESTOERRELSE)

  // Bygg TidligereItem-lister fra rådataene
  type CoverObj = { bilde_url: string; thumb_url: string | null }
  type RawAlbumEmbed = {
    id: string
    tittel: string
    cover: CoverObj | CoverObj[] | null
    antall: { count: number }[] | null
  } | null
  type RawMelding = {
    id: string
    innhold: string | null
    opprettet: string
    sist_aktivitet: string
    arkivert_tidspunkt: string | null
    fra_facebook: boolean | null
    profil_id: string
    profiles: { navn: string | null; bilde_url: string | null; rolle: string | null } | null
    melding_bilder: { bilde_url: string; rekkefoelge: number }[] | null
    melding_chat: { count: number }[] | null
    album: RawAlbumEmbed | RawAlbumEmbed[]
    spotlight: CoverObj | CoverObj[] | null
  }

  // Alle bilder er nå i melding_bilder — bilde_url-kolonnen er droppet (#174)
  const meldinger: MeldingRaad[] = (meldSide as RawMelding[]).map(m => ({
    id: m.id,
    innhold: m.innhold,
    opprettet: m.opprettet,
    sist_aktivitet: m.sist_aktivitet,
    arkivert_tidspunkt: m.arkivert_tidspunkt,
    bilder: [...(m.melding_bilder ?? [])]
      .sort((a, b) => a.rekkefoelge - b.rekkefoelge)
      .map(b => b.bilde_url),
    fraFacebook: m.fra_facebook === true,
    forfatter: {
      id: m.profil_id,
      navn: m.profiles?.navn ?? 'Ukjent',
      bilde_url: m.profiles?.bilde_url ?? null,
      rolle: m.profiles?.rolle ?? null,
    },
    reaksjoner: [], // reaksjoner hentes ikke på /tidligere for å holde siden rask
    antallKommentarer: (m.melding_chat?.[0] as { count: number } | undefined)?.count ?? 0,
    albumSpotlight: tilAlbumSpotlight(m.album, m.spotlight),
  }))

  // Bygg items for arrangmenter
  const arrItems: TidligereItem[] = arrSide.map(a => ({
    kind: 'arrangement' as const,
    sortIso: a.start_tidspunkt,
    data: tilKort(
      {
        ...a,
        paameldinger: (a.paameldinger ?? []).map(p => ({
          ...p,
          profiles: p.profiles as { visningsnavn: string | null; bilde_url: string | null; rolle?: string | null } | null,
        })),
      },
      user.id,
    ),
  }))

  // Bygg items for meldinger — alle i «tidligere»-stil (dempet visning).
  // Arkiverte innlegg sorteres på arkivert_tidspunkt (faller tilbake til
  // sist_aktivitet for ikke-arkiverte) — konsistent med forsiden, se
  // byggAgenda i lib/agenda-sortering.ts. (#312)
  const meldItems: TidligereItem[] = meldinger.map(m => ({
    kind: 'melding' as const,
    sortIso: m.arkivert_tidspunkt ?? m.sist_aktivitet,
    data: tilMeldingKort(m, true),
  }))

  // Bygg items for polls
  type RawPoll = {
    id: string
    spoersmaal: string
    svarfrist: string
    flervalg: boolean
    opprettet_av: string
    kaaring_mal_id: string | null
    poll_valg: { id: string; tekst: string; rekkefoelge: number }[] | null
    poll_stemme: { profil_id: string; valg_id: string }[] | null
  }
  // Kåringspoller på denne siden er alltid avsluttede (svarfrist < nå), så i
  // praksis er stemmene i ferd med å åpnes — men RLS-policyen (mig. 076)
  // skiller ikke på avsluttet-status, den filtrerer alltid bort andres
  // stemmer for vanlige medlemmer. Vi bruker derfor RPC-aggregat (samme som
  // forsiden) for å få totaler.
  const kaaringspollIder = (pollSide as RawPoll[])
    .filter(p => p.kaaring_mal_id !== null)
    .map(p => p.id)
  const kaaringAggregater = await hentPollStemmerAggregatBatch(supabase, kaaringspollIder)

  const pollItems: TidligereItem[] = (pollSide as RawPoll[]).map(p => {
    const stemmer = p.poll_stemme ?? []
    const unike = new Set(stemmer.map(s => s.profil_id))
    const mine = stemmer.filter(s => s.profil_id === user.id).map(s => s.valg_id)
    const valg = [...(p.poll_valg ?? [])].sort((a, b) => a.rekkefoelge - b.rekkefoelge).map(v => ({ id: v.id, tekst: v.tekst }))

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
      for (const s of stemmer) stemmerPerValg[s.valg_id] = (stemmerPerValg[s.valg_id] ?? 0) + 1
      antallStemmer = unike.size
    }

    return {
      kind: 'poll' as const,
      sortIso: p.svarfrist,
      data: tilPollKort(
        {
          id: p.id,
          spoersmaal: p.spoersmaal,
          svarfrist: p.svarfrist,
          flervalg: p.flervalg,
          opprettet_av: p.opprettet_av,
          antallStemmer,
          harStemt: unike.has(user.id),
          valg,
          mineStemmer: mine,
          stemmerPerValg,
        },
        true, // avsluttet
      ),
    }
  })

  // Merge og sorter alle items synkende på (sortIso, id).
  // Vi bruker id som tiebreaker for deterministisk rekkefølge.
  const alleItems: TidligereItem[] = [...arrItems, ...meldItems, ...pollItems].sort((a, b) => {
    const isoDiff = b.sortIso.localeCompare(a.sortIso)
    if (isoDiff !== 0) return isoDiff
    return b.data.id.localeCompare(a.data.id)
  })

  // Klipp til sidestørrelse etter merge (kan ha fått inntil 3*30 = 90 items)
  const side = alleItems.slice(0, TIDLIGERE_SIDESTOERRELSE)

  // Bygg neste cursor: per type avgjør vi posisjonen etter denne regelen:
  //   1. Hvis typen ble emittert i `side` → cursor = siste emitterte (iso, id)
  //   2. Hvis typen IKKE ble emittert, men `harMer{Type}` = true → behold input-cursor
  //      (vi har lest 31 rader uten å vise noen — neste side må fortsette der vi slapp)
  //   3. Hvis typen IKKE ble emittert OG `harMer{Type}` = false → null (uttømt)
  // Regel 2 er kritisk: tidligere satte vi cursor til null her, som ville
  // restarte typen fra toppen og gi duplikater på neste sidevisning.
  const sisteArr = side.filter(i => i.kind === 'arrangement').at(-1)
  const sisteMeld = side.filter(i => i.kind === 'melding').at(-1)
  const sistePoll = side.filter(i => i.kind === 'poll').at(-1)

  type Pos = [string, string] | null
  const nyArrCursor: Pos = sisteArr
    ? [sisteArr.sortIso, sisteArr.data.id]
    : harMerArr
      ? cursor.a // ikke emittert i denne siden — behold input-posisjon
      : null
  // Meldings-cursoren MÅ bruke sist_aktivitet, ikke display-sortIso. Visningen
  // sorterer på arkivert_tidspunkt ?? sist_aktivitet (#312), men DB-keyset-
  // filteret over kjører mot sist_aktivitet-kolonnen. Bruker vi arkivert_tidspunkt
  // som cursor mot en sist_aktivitet-sammenligning glipper/dupliseres rader.
  const sisteMeldSistAktivitet = sisteMeld
    ? meldinger.find(m => m.id === sisteMeld.data.id)?.sist_aktivitet ?? sisteMeld.sortIso
    : null
  const nyMeldCursor: Pos = sisteMeld
    ? [sisteMeldSistAktivitet!, sisteMeld.data.id]
    : harMerMeld
      ? cursor.m
      : null
  const nyPollCursor: Pos = sistePoll
    ? [sistePoll.sortIso, sistePoll.data.id]
    : harMerPoll
      ? cursor.p
      : null

  // Bare bygg cursor hvis minst én type fortsatt har mer å hente.
  const nesteCursor =
    nyArrCursor || nyMeldCursor || nyPollCursor
      ? enkodeCursor({ a: nyArrCursor, m: nyMeldCursor, p: nyPollCursor })
      : null

  return (
    <div style={{ padding: '0 20px 40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, marginBottom: 20 }}>
        <Link
          href="/"
          style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-secondary)', textDecoration: 'none', fontSize: 14 }}
        >
          <ChevronLeftIcon style={{ width: 16, height: 16 }} /> Tilbake
        </Link>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: '-0.3px',
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          Hele historikken
        </h1>
      </div>

      {side.length === 0 ? (
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-tertiary)',
            letterSpacing: '0.5px',
            marginTop: 48,
            textAlign: 'center',
          }}
        >
          Her stopper løypa, gutta.
        </p>
      ) : (
        <section>
          <SectionLabel>Tidligere</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {side.map(t => {
              if (t.kind === 'arrangement')
                return <ArrangementKort key={t.data.id} arr={t.data} tidligere />
              if (t.kind === 'poll')
                return <PollKort key={t.data.id} poll={t.data} tidligere />
              return (
                <MeldingKort
                  key={t.data.id}
                  melding={t.data}
                  brukerId={user.id}
                  erAdmin={erAdmin}
                />
              )
            })}
          </div>

          {nesteCursor && (
            <Link
              href={`/tidligere?cursor=${nesteCursor}`}
              style={{
                display: 'block',
                marginTop: 20,
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
              Last mer →
            </Link>
          )}
        </section>
      )}
    </div>
  )
}
