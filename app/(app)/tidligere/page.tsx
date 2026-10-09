// Full historikk, paginert med opaque cursor (#176). Overlapper bevisst med
// agenda-vinduet på forsiden. De tre typene pagineres uavhengig med keyset og
// merges synkende på (sortIso, id). Filter via ?type=… (#487).

import { ensureInnlogget } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { MIN_TREFFMAAL_PX, TIDLIGERE_SIDESTOERRELSE } from '@/lib/konstanter'
import { dekodeCursor, byggNesteCursor, klippSide, kildeTilstandFra } from '@/lib/tidligere-cursor'
import { parseFilter, skalHente, arrangementstypeFor, TOM_TEKST } from '@/lib/tidligere-filter'
import { feilTekst, proevIgjenHref, visTomTekst, bunnSlot, type TidligereKilde } from '@/lib/tidligere-feil'
import { tilKort, tilMeldingKort, tilPollKort, ikkePaagaaendeFilter } from '@/lib/agenda-sortering'
import type { TidligereItem, MeldingRaad } from '@/lib/agenda-sortering'
import { hentPollStemmerAggregatBatch } from '@/lib/queries/poll'
import { ALBUM_KORT_SELECT, tilAlbumKort } from '@/lib/melding-album'
import { naa } from '@/lib/dato'
import { kanAdministrere } from '@/lib/roller'
import { logg } from '@/lib/logg'
import ArrangementKort from '@/components/agenda/ArrangementKort'
import PollKort from '@/components/agenda/PollKort'
import MeldingKort from '@/components/agenda/MeldingKort'
import SectionLabel from '@/components/ui/SectionLabel'
import TidligereTypeFilter from '@/components/tidligere/TidligereTypeFilter'
import TidligereFeilBanner from '@/components/tidligere/TidligereFeilBanner'
import Link from 'next/link'
import TilbakeKnapp from '@/components/ui/TilbakeKnapp'

export const dynamic = 'force-dynamic'

export default async function TidligereSide({
  searchParams,
}: {
  // `r` er en cache-buster fra «Prøv igjen»-lenka og leses aldri her.
  searchParams: Promise<{ cursor?: string; type?: string; r?: string }>
}) {
  const { user } = await ensureInnlogget()
  const supabase = await createServerClient()
  const { cursor: cursorStr, type: typeStr } = await searchParams
  const cursor = dekodeCursor(cursorStr)
  const filter = parseFilter(typeStr)

  // Rollen styrer om av-arkiver-knappen vises på andres innlegg (#312).
  const { data: minProfil, error: minProfilFeil } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()
  // Feil → «ikke admin» (fail closed): skjuler bare en knapp, ikke verdt å ta ned siden.
  if (minProfilFeil) {
    await logg.feil('tidligere.minProfil.oppslag.feilet', minProfilFeil, { ctx: { profil_id: user.id } })
  }
  const erAdmin = kanAdministrere(minProfil?.rolle ?? null)

  const grense = TIDLIGERE_SIDESTOERRELSE + 1 // én ekstra avslører om det finnes mer

  // === Arrangementer ===
  // Pågående tur hører til «Kommende» på forsiden (#766). Filteret bor ved
  // erPaagaaende() i lib/agenda-sortering.ts, testet mot den (#851).
  let arrQuery = supabase
    .from('arrangementer')
    .select(
      'id, type, tittel, start_tidspunkt, slutt_tidspunkt, oppmoetested, bilde_url, paameldinger (profil_id, status, profiles (visningsnavn, bilde_url, rolle))',
    )
    .lt('start_tidspunkt', naa())
    .or(ikkePaagaaendeFilter(naa()))
    .order('start_tidspunkt', { ascending: false })
    .order('id', { ascending: false })
    .limit(grense)

  const arrType = arrangementstypeFor(filter)
  if (arrType) {
    arrQuery = arrQuery.eq('type', arrType)
  }

  if (cursor.a) {
    arrQuery = arrQuery.or(
      `start_tidspunkt.lt.${cursor.a[0]},and(start_tidspunkt.eq.${cursor.a[0]},id.lt.${cursor.a[1]})`,
    )
  }

  // === Meldinger ===
  let meldQuery = supabase
    .from('meldinger')
    .select(
      `id, innhold, opprettet, sist_aktivitet, arkivert_tidspunkt, sorterings_tidspunkt, aktuell_dato, fra_facebook, profil_id,
       profiles!meldinger_profil_id_fkey (navn, bilde_url, rolle),
       melding_bilder (bilde_url, rekkefoelge),
       melding_chat (count),
       ${ALBUM_KORT_SELECT}`,
    )
    .order('sorterings_tidspunkt', { ascending: false })
    .order('id', { ascending: false })
    .limit(grense)

  if (cursor.m) {
    // Keyset, .order() og sortIso MÅ bruke samme kolonne (sorterings_tidspunkt,
    // mig. 120), ellers kan keyset hoppe over arkiverte rader (#491).
    meldQuery = meldQuery.or(
      `sorterings_tidspunkt.lt.${cursor.m[0]},and(sorterings_tidspunkt.eq.${cursor.m[0]},id.lt.${cursor.m[1]})`,
    )
  }

  // === Polls ===
  // kaaring_mal_id skiller ut kåringspoller, der RLS skjuler andres stemmer
  // (mig. 076) og totalene må hentes via RPC, som på forsiden.
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
    pollQuery = pollQuery.or(
      `svarfrist.lt.${cursor.p[0]},and(svarfrist.eq.${cursor.p[0]},id.lt.${cursor.p[1]})`,
    )
  }

  // Kun spørringene filteret trenger; resten resolver til null i samme
  // Promise.all (parallellitet bevart). HELE svaret beholdes, ikke bare .data,
  // ellers kan «filtrert bort» ikke skilles fra «feilet» (#492).
  const [arrSvar, meldSvar, pollSvar] = await Promise.all([
    skalHente(filter, 'arrangement') ? arrQuery : Promise.resolve(null),
    skalHente(filter, 'melding') ? meldQuery : Promise.resolve(null),
    skalHente(filter, 'poll') ? pollQuery : Promise.resolve(null),
  ])

  // `null`-svar = filtrert bort; `svar.error` = kjørte, men feilet.
  const arrFeilet = arrSvar?.error != null
  const meldFeilet = meldSvar?.error != null
  const pollFeilet = pollSvar?.error != null
  const arrRaad = arrSvar?.data ?? null
  const meldRaad = meldSvar?.data ?? null
  const pollRaad = pollSvar?.data ?? null

  // flatMap i stedet for non-null-assertions: `svar?.error != null` lar TS bevise at feltet finnes.
  const feilendeKilder: { kilde: TidligereKilde; error: NonNullable<typeof arrSvar>['error'] }[] = (
    [
      ['arrangement', arrSvar],
      ['melding', meldSvar],
      ['poll', pollSvar],
    ] as const
  ).flatMap(([kilde, svar]) => (svar?.error != null ? [{ kilde, error: svar.error }] : []))

  // `.catch` er ufravikelig: Sentry-kallet i logg.feil er ubeskyttet (#496), og
  // en kastende logger ville gjort en delvis degradering til en 500.
  await Promise.all(
    feilendeKilder.map(({ kilde, error }) =>
      logg
        .feil('tidligere.hent.feilet', error, {
          fingerprint: `tidligere.hent.${kilde}`,
          ctx: { code: (error as { code?: string })?.code },
        })
        .catch(() => {}),
    ),
  )
  const harFeil = feilendeKilder.length > 0

  const arrKlippet = klippSide(arrRaad, TIDLIGERE_SIDESTOERRELSE)
  const meldKlippet = klippSide(meldRaad, TIDLIGERE_SIDESTOERRELSE)
  const pollKlippet = klippSide(pollRaad, TIDLIGERE_SIDESTOERRELSE)
  const arrSide = arrKlippet.rader
  const meldSide = meldKlippet.rader
  const pollSide = pollKlippet.rader

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
    sorterings_tidspunkt: string
    aktuell_dato: string | null
    fra_facebook: boolean | null
    profil_id: string
    profiles: { navn: string | null; bilde_url: string | null; rolle: string | null } | null
    melding_bilder: { bilde_url: string; rekkefoelge: number }[] | null
    melding_chat: { count: number }[] | null
    album: RawAlbumEmbed | RawAlbumEmbed[]
  }

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

  // sortIso = sorterings_tidspunkt, samme nøkkel som .order()/keyset over (#491).
  // Rå-rad → MeldingRaad → TidligereItem i ÉN map: parallelle lister koblet på
  // indeks blir en stille bug hvis en av dem senere filtreres.
  const meldItems: TidligereItem[] = meldSide.map((m: RawMelding) => {
    const raad: MeldingRaad = {
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
      reaksjoner: [], // hentes ikke her, for å holde siden rask
      antallKommentarer: (m.melding_chat?.[0] as { count: number } | undefined)?.count ?? 0,
      albumKort: tilAlbumKort(m.album),
      aktuell_dato: m.aktuell_dato,
    }
    return {
      kind: 'melding' as const,
      sortIso: m.sorterings_tidspunkt,
      data: tilMeldingKort(raad, true),
    }
  })

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
  // RLS (mig. 076) skjuler andres stemmer også på avsluttede kåringspoller,
  // så totalene hentes via RPC-aggregat.
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
      // harStemt utledes fortsatt fra poll_stemme — egne stemmer er synlige.
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

  // id som tiebreaker for deterministisk rekkefølge.
  const alleItems: TidligereItem[] = [...arrItems, ...meldItems, ...pollItems].sort((a, b) => {
    const isoDiff = b.sortIso.localeCompare(a.sortIso)
    if (isoDiff !== 0) return isoDiff
    return b.data.id.localeCompare(a.data.id)
  })

  const side = alleItems.slice(0, TIDLIGERE_SIDESTOERRELSE)

  // Neste cursor: «hvor starter neste side» og «finnes det en neste side» er
  // to uavhengige spørsmål per type (#488) — reglene bor i lib/tidligere-cursor.ts.
  const arrTilstand = kildeTilstandFra({
    inn: cursor.a,
    side: arrKlippet,
    emittert: side.filter(i => i.kind === 'arrangement'),
    feilet: arrFeilet,
  })
  const meldTilstand = kildeTilstandFra({
    inn: cursor.m,
    side: meldKlippet,
    emittert: side.filter(i => i.kind === 'melding'),
    feilet: meldFeilet,
  })
  const pollTilstand = kildeTilstandFra({
    inn: cursor.p,
    side: pollKlippet,
    emittert: side.filter(i => i.kind === 'poll'),
    feilet: pollFeilet,
  })

  // Null når en aktiv kilde har feilet — «Last mer» og «Prøv igjen» utelukker hverandre.
  const nesteCursor = byggNesteCursor({ a: arrTilstand, m: meldTilstand, p: pollTilstand })
  const feilTekstVerdi = feilTekst(feilendeKilder.map(f => f.kilde), filter)
  const retryHref = harFeil ? proevIgjenHref(filter, cursorStr, naa()) : null

  // UI-invariantene er enhetstestet i lib/tidligere-feil.ts — ikke inline dem her.
  const visTom = visTomTekst(side.length, harFeil)
  const bunn = bunnSlot(nesteCursor, retryHref)

  return (
    <div style={{ padding: '0 20px 40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, marginBottom: 20 }}>
        <TilbakeKnapp href="/" til="agendaen" />
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

      {feilTekstVerdi && (
        // role="status" (polite): skjermleser nevner banneret uten å avbryte.
        <div role="status" style={{ marginBottom: 20 }}>
          <TidligereFeilBanner tekst={feilTekstVerdi} />
        </div>
      )}

      {/* Regelen bor i visTomTekst() (lib/tidligere-feil.ts, enhetstestet). */}
      {visTom ? (
        <p
          data-testid="tidligere-tom"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-tertiary)',
            letterSpacing: '0.5px',
            marginTop: 48,
            textAlign: 'center',
          }}
        >
          {/* Med cursor står han på en tom siste side, ikke en tom historikk — da
              lyver «Ingen X». Grenen trengs fortsatt for foreldede/bokmerkede
              cursorer (dekket av e2e/tidligere.spec.ts). */}
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
          {/* Ingen etikett over en tom liste (alle kilder feilet). */}
          {side.length > 0 && <SectionLabel>Tidligere</SectionLabel>}
          {/* e2e/tidligere.spec.ts teller kort via `:scope > a` — ikke wrap et
              kort i en ekstra div (#489). */}
          <div data-testid="tidligere-liste" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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

          {/* Avgjørelsen ligger i `bunn`; `&& nesteCursor` / `&& retryHref` er
              kun TypeScript-narrowing. */}
          {bunn === 'last-mer' && nesteCursor ? (
            // Vanlig <a>, ikke next/link: prefetch mot samme rute med ny
            // searchParam etterlater en abortert cache-entry klikket henger på (#659).
            <a
              data-testid="tidligere-last-mer"
              href={`/tidligere?${new URLSearchParams({
                ...(filter !== 'alle' && { type: filter }),
                cursor: nesteCursor,
              })}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 20,
                minHeight: MIN_TREFFMAAL_PX,
                padding: '0 14px',
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
            </a>
          ) : bunn === 'proev-igjen' && retryHref ? (
            <div style={{ marginTop: 20, textAlign: 'center' }}>
              {/* Vanlig <a> (#659), som «Last mer» — kritisk her: eneste vei ut
                  av feiltilstanden. */}
              <a
                data-testid="tidligere-proev-igjen"
                href={retryHref}
                aria-label="Prøv å hente historikken på nytt"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: MIN_TREFFMAAL_PX,
                  padding: '0 14px',
                  borderRadius: 999,
                  border: '0.5px solid var(--danger-border)',
                  color: 'var(--danger-hot)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: '1.4px',
                  textTransform: 'uppercase',
                  textDecoration: 'none',
                }}
              >
                Prøv igjen
              </a>
            </div>
          ) : null}
        </section>
      )}
    </div>
  )
}
