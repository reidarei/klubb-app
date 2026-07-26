// Full historikk — alle arrangementer/meldinger/polls i fortid, paginert med
// opaque cursor. Overlapper bevisst med agenda-vinduet på forsiden. De tre
// typene pagineres uavhengig med keyset og merges sortert synkende på
// (sortIso, id). Issue #176. Kan filtreres på innholdstype (møte/tur/
// melding/poll) via ?type=… — se lib/tidligere-filter.ts. Issue #487.

import { ensureInnlogget } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { TIDLIGERE_SIDESTOERRELSE } from '@/lib/konstanter'
import { dekodeCursor, byggNesteCursor, type KildeTilstand } from '@/lib/tidligere-cursor'
import { parseFilter, skalHente, arrangementstypeFor, TOM_TEKST } from '@/lib/tidligere-filter'
import { tilKort, tilMeldingKort, tilPollKort } from '@/lib/agenda-sortering'
import type { TidligereItem, MeldingRaad } from '@/lib/agenda-sortering'
import { hentPollStemmerAggregatBatch } from '@/lib/queries/poll'
import { ALBUM_KORT_SELECT, tilAlbumKort } from '@/lib/melding-album'
import { naa } from '@/lib/dato'
import { kanAdministrere } from '@/lib/roller'
import ArrangementKort from '@/components/agenda/ArrangementKort'
import PollKort from '@/components/agenda/PollKort'
import MeldingKort from '@/components/agenda/MeldingKort'
import SectionLabel from '@/components/ui/SectionLabel'
import TidligereTypeFilter from '@/components/tidligere/TidligereTypeFilter'
import Link from 'next/link'
import { ChevronLeftIcon } from '@heroicons/react/24/outline'

export const dynamic = 'force-dynamic'

export default async function TidligereSide({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; type?: string }>
}) {
  const { user } = await ensureInnlogget()
  const supabase = await createServerClient()
  const { cursor: cursorStr, type: typeStr } = await searchParams
  const cursor = dekodeCursor(cursorStr)
  const filter = parseFilter(typeStr)

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

  const arrType = arrangementstypeFor(filter)
  if (arrType) {
    arrQuery = arrQuery.eq('type', arrType)
  }

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
      `id, innhold, opprettet, sist_aktivitet, arkivert_tidspunkt, aktuell_dato, fra_facebook, profil_id,
       profiles!meldinger_profil_id_fkey (navn, bilde_url, rolle),
       melding_bilder (bilde_url, rekkefoelge),
       melding_chat (count),
       ${ALBUM_KORT_SELECT}`,
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

  // Kun spørringene det aktive filteret faktisk trenger kjøres — skippede
  // typer resolver til null med samme Promise.all (parallellitet bevart,
  // ytelseskritisk for type=alle som fortsatt kjører alle tre samtidig).
  const [arrRaad, meldRaad, pollRaad] = await Promise.all([
    skalHente(filter, 'arrangement') ? arrQuery.then(r => r.data) : Promise.resolve(null),
    skalHente(filter, 'melding') ? meldQuery.then(r => r.data) : Promise.resolve(null),
    skalHente(filter, 'poll') ? pollQuery.then(r => r.data) : Promise.resolve(null),
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
    aktuell_dato: string | null
    fra_facebook: boolean | null
    profil_id: string
    profiles: { navn: string | null; bilde_url: string | null; rolle: string | null } | null
    melding_bilder: { bilde_url: string; rekkefoelge: number }[] | null
    melding_chat: { count: number }[] | null
    album: RawAlbumEmbed | RawAlbumEmbed[]
  }

  // Alle bilder er nå i melding_bilder — bilde_url-kolonnen er droppet (#174)
  const meldinger: MeldingRaad[] = meldSide.map((m: RawMelding) => ({
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
    albumKort: tilAlbumKort(m.album),
    aktuell_dato: m.aktuell_dato,
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

  // Bygg neste cursor. To uavhengige spørsmål per type (se #488 — de var
  // slått sammen tidligere, som fikk «Last mer» til å vises på siste side):
  //   1. Hvor skal neste side starte for denne typen? → nestePosisjon()
  //   2. Finnes det i det hele tatt en neste side for denne typen? → harMerFraKilde()
  // Se lib/tidligere-cursor.ts for selve reglene og hvorfor de er riktige.
  const emittertArr = side.filter(i => i.kind === 'arrangement')
  const emittertMeld = side.filter(i => i.kind === 'melding')
  const emittertPoll = side.filter(i => i.kind === 'poll')
  const sisteArr = emittertArr.at(-1)
  const sisteMeld = emittertMeld.at(-1)
  const sistePoll = emittertPoll.at(-1)

  // Meldings-cursoren MÅ bruke sist_aktivitet, ikke display-sortIso. Visningen
  // sorterer på arkivert_tidspunkt ?? sist_aktivitet (#312), men DB-keyset-
  // filteret over kjører mot sist_aktivitet-kolonnen. Bruker vi arkivert_tidspunkt
  // som cursor mot en sist_aktivitet-sammenligning glipper/dupliseres rader.
  const sisteMeldSistAktivitet = sisteMeld
    ? meldinger.find(m => m.id === sisteMeld.data.id)?.sist_aktivitet ?? sisteMeld.sortIso
    : null

  // antallISidevindu MÅ leses fra *Side-listene (klippet til sidestørrelse),
  // ikke fra *Raad (som har sidestørrelse+1 rader). Sender man rå-lengden blir
  // antallEmittert < antallISidevindu permanent true, og «Last mer» henger
  // igjen på siste side igjen — akkurat bugen #488 fikset.
  const arrTilstand: KildeTilstand = {
    inn: cursor.a,
    antallISidevindu: arrSide.length,
    antallEmittert: emittertArr.length,
    sisteEmittert: sisteArr ? [sisteArr.sortIso, sisteArr.data.id] : null,
    flereEnnSiden: harMerArr,
  }
  const meldTilstand: KildeTilstand = {
    inn: cursor.m,
    antallISidevindu: meldSide.length,
    antallEmittert: emittertMeld.length,
    sisteEmittert: sisteMeld ? [sisteMeldSistAktivitet!, sisteMeld.data.id] : null,
    flereEnnSiden: harMerMeld,
  }
  const pollTilstand: KildeTilstand = {
    inn: cursor.p,
    antallISidevindu: pollSide.length,
    antallEmittert: emittertPoll.length,
    sisteEmittert: sistePoll ? [sistePoll.sortIso, sistePoll.data.id] : null,
    flereEnnSiden: harMerPoll,
  }

  const nesteCursor = byggNesteCursor({ a: arrTilstand, m: meldTilstand, p: pollTilstand })

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

      <TidligereTypeFilter aktiv={filter} />

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
          {/* Har brukeren paginert hit (cursorStr satt), er lista ikke tom — han står
              bare på en tom siste side. Da lyver «Ingen X i historikken»; «Her stopper
              løypa» er riktig for begge. «Last mer» på en reelt tom side skal ikke
              lenger skje (fikset i #488), men grenen beholdes: en bokmerket/foreldet
              cursor, eller melding-typens divergens mellom sist_aktivitet og
              arkivert_tidspunkt, kan fortsatt lande på en tom side her. */}
          {filter === 'alle' || cursorStr ? (
            'Her stopper løypa, gutta.'
          ) : (
            <>
              Ingen {TOM_TEKST[filter]} i historikken.{' '}
              <Link href="/tidligere" style={{ color: 'var(--accent)' }}>
                Vis alle
              </Link>
            </>
          )}
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
              href={`/tidligere?${new URLSearchParams({
                ...(filter !== 'alle' && { type: filter }),
                cursor: nesteCursor,
              })}`}
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
