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
import { feilTekst, proevIgjenHref, visTomTekst, bunnSlot, type TidligereKilde } from '@/lib/tidligere-feil'
import { tilKort, tilMeldingKort, tilPollKort } from '@/lib/agenda-sortering'
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
import { ChevronLeftIcon } from '@heroicons/react/24/outline'

export const dynamic = 'force-dynamic'

export default async function TidligereSide({
  searchParams,
}: {
  // `r` er en ren cache-buster fra «Prøv igjen»-lenka (se lib/tidligere-feil.ts)
  // og leses aldri her — den finnes kun for å tvinge en fersk server-render.
  searchParams: Promise<{ cursor?: string; type?: string; r?: string }>
}) {
  const { user } = await ensureInnlogget()
  const supabase = await createServerClient()
  const { cursor: cursorStr, type: typeStr } = await searchParams
  const cursor = dekodeCursor(cursorStr)
  const filter = parseFilter(typeStr)

  // Innlogget brukers rolle — styrer om av-arkiver-knappen vises på andres
  // innlegg (admin kan av-arkivere alle, ellers kun egne). (#312)
  const { data: minProfil, error: minProfilFeil } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()
  // Feiler oppslaget, faller vi tilbake til «ikke admin» (fail closed) — det
  // skjuler kun av-arkiver-knappen for andres innlegg, ikke sensitivt nok til
  // å ta ned hele historikk-siden. Logges likevel så feilen ikke drukner.
  if (minProfilFeil) {
    await logg.feil('tidligere.minProfil.oppslag.feilet', minProfilFeil, { ctx: { profil_id: user.id } })
  }
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
    // Keyset mot sorterings_tidspunkt (mig. 120) — samme kolonne som .order()
    // over og visningens sortIso under. Før #491 leste dette mot sist_aktivitet
    // mens visningen sorterte på arkivert_tidspunkt ?? sist_aktivitet: to
    // uttrykk for «samme» regel som kunne divergere, og keyset-filteret kunne
    // dermed hoppe over arkiverte rader.
    meldQuery = meldQuery.or(
      `sorterings_tidspunkt.lt.${cursor.m[0]},and(sorterings_tidspunkt.eq.${cursor.m[0]},id.lt.${cursor.m[1]})`,
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
  //
  // Vi beholder HELE svaret (ikke bare .data) — se #492. `r.data` alene kan
  // ikke skille «filteret slo av kilden» fra «spørringen feilet»: begge gir
  // null. Med det fulle svaret leser vi `.error` eksplisitt under i stedet.
  const [arrSvar, meldSvar, pollSvar] = await Promise.all([
    skalHente(filter, 'arrangement') ? arrQuery : Promise.resolve(null),
    skalHente(filter, 'melding') ? meldQuery : Promise.resolve(null),
    skalHente(filter, 'poll') ? pollQuery : Promise.resolve(null),
  ])

  // Tri-state: `null`-svar betyr «filteret slo av kilden» (skalHente var
  // false), `svar.error` betyr «spørringen kjørte men feilet». `arrRaad` har
  // samme type og betydning som før denne endringen.
  const arrFeilet = arrSvar?.error != null
  const meldFeilet = meldSvar?.error != null
  const pollFeilet = pollSvar?.error != null
  const arrRaad = arrSvar?.data ?? null
  const meldRaad = meldSvar?.data ?? null
  const pollRaad = pollSvar?.data ?? null

  // Bygget med flatMap over (kilde, svar)-par i stedet for tre non-null-
  // assertions: `svar?.error != null` narrower både svaret og feltet, så
  // TypeScript beviser at `svar.error` finnes i stedet for at vi lover det.
  const feilendeKilder: { kilde: TidligereKilde; error: NonNullable<typeof arrSvar>['error'] }[] = (
    [
      ['arrangement', arrSvar],
      ['melding', meldSvar],
      ['poll', pollSvar],
    ] as const
  ).flatMap(([kilde, svar]) => (svar?.error != null ? [{ kilde, error: svar.error }] : []))

  // Alltid await — logg.feil() må aldri blokkere responsen usett eller kastes
  // i taushet (presedens: lib/actions/arrangementer.ts:115). `.catch` er
  // ufravikelig: Sentry-kallet inne i logg.feil er ubeskyttet (se #496), og
  // en kastende logger ville gjort en delvis degradering til en 500 — stikk
  // motsatt av det hele denne siden bygger.
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
    sorterings_tidspunkt: string
    aktuell_dato: string | null
    fra_facebook: boolean | null
    profil_id: string
    profiles: { navn: string | null; bilde_url: string | null; rolle: string | null } | null
    melding_bilder: { bilde_url: string; rekkefoelge: number }[] | null
    melding_chat: { count: number }[] | null
    album: RawAlbumEmbed | RawAlbumEmbed[]
  }

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
  // sortIso kommer fra sorterings_tidspunkt (mig. 120, #491) — DB-en eier nå
  // nøkkelen «arkivert_tidspunkt hvis satt, ellers sist_aktivitet», så denne
  // verdien er alltid identisk med .order()/keyset-filteret over.
  // Rå-rad → MeldingRaad → TidligereItem skjer i ÉN map: to parallelle lister
  // koblet på indeks er en stille bug i vente hvis en av dem senere filtreres.
  const meldItems: TidligereItem[] = meldSide.map((m: RawMelding) => {
    // Alle bilder er nå i melding_bilder — bilde_url-kolonnen er droppet (#174)
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
      reaksjoner: [], // reaksjoner hentes ikke på /tidligere for å holde siden rask
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
    feilet: arrFeilet,
  }
  const meldTilstand: KildeTilstand = {
    inn: cursor.m,
    antallISidevindu: meldSide.length,
    antallEmittert: emittertMeld.length,
    sisteEmittert: sisteMeld ? [sisteMeld.sortIso, sisteMeld.data.id] : null,
    flereEnnSiden: harMerMeld,
    feilet: meldFeilet,
  }
  const pollTilstand: KildeTilstand = {
    inn: cursor.p,
    antallISidevindu: pollSide.length,
    antallEmittert: emittertPoll.length,
    sisteEmittert: sistePoll ? [sistePoll.sortIso, sistePoll.data.id] : null,
    flereEnnSiden: harMerPoll,
    feilet: pollFeilet,
  }

  // nesteCursor og harFeil er gjensidig utelukkende ved konstruksjon
  // (byggNesteCursor returnerer null når noen aktiv kilde har feilet, se
  // lib/tidligere-cursor.ts) — «Last mer» og «Prøv igjen» kan derfor aldri
  // vises samtidig.
  const nesteCursor = byggNesteCursor({ a: arrTilstand, m: meldTilstand, p: pollTilstand })
  const feilTekstVerdi = feilTekst(feilendeKilder.map(f => f.kilde), filter)
  const retryHref = harFeil ? proevIgjenHref(filter, cursorStr, naa()) : null

  // De to UI-invariantene bor i lib/tidligere-feil.ts og er enhetstestet der —
  // ikke inline betingelsene igjen her, da mister de mutasjonsdekningen.
  const visTom = visTomTekst(side.length, harFeil)
  const bunn = bunnSlot(nesteCursor, retryHref)

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

      {feilTekstVerdi && (
        // role="status" (polite) — banneret dukker opp etter navigasjon, så en
        // skjermleser skal nevne det uten å avbryte det brukeren holder på med.
        <div role="status" style={{ marginBottom: 20 }}>
          <TidligereFeilBanner tekst={feilTekstVerdi} />
        </div>
      )}

      {/* visTomTekst() eier regelen «tom side, men ikke fordi noe feilet» —
          se lib/tidligere-feil.ts og __tests__/tidligere-feil.test.ts. */}
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
          {/* Har brukeren paginert hit (cursorStr satt), er lista ikke tom — han står
              bare på en tom siste side. Da lyver «Ingen X i historikken»; «Her stopper
              løypa» er riktig for begge. «Last mer» på en reelt tom side skal ikke
              lenger skje (fikset i #488), men grenen beholdes: en bokmerket/foreldet
              cursor kan fortsatt lande på en tom side her.
              e2e/tidligere.spec.ts dekker grenen via en foreldet cursor. */}
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
          {/* Ingen seksjonsetikett over en tom liste: når alle kilder feilet er
              side.length 0, og en ensom «Tidligere»-overskrift over ingenting
              ser ut som en bug i seg selv. */}
          {side.length > 0 && <SectionLabel>Tidligere</SectionLabel>}
          {/* Hvert kort under (ArrangementKort/PollKort/MeldingKort) rendrer ett
              <a> på toppnivå. e2e/tidligere.spec.ts teller kort via
              `:scope > a` på denne diven — ikke wrap et kort i en ekstra div,
              det bryter den tellingen. Se #489. */}
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

          {/* bunnSlot() eier valget mellom «Last mer» og «Prøv igjen» (se
              lib/tidligere-feil.ts) — de deler denne slotten og er gjensidig
              utelukkende ved konstruksjon. Retry-pillen bruker samme href som
              banneret over, slik at en bruker som har scrollet til bunnen
              opplever at knappen byttet ord, ikke at den forsvant.
              `&& nesteCursor` / `&& retryHref` under er kun TypeScript-
              narrowing til string — avgjørelsen ligger i `bunn`. */}
          {bunn === 'last-mer' && nesteCursor ? (
            <Link
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
                minHeight: 44, // WCAG 2.5.8 / iOS touch-target-minimum — samme mål som «Prøv igjen» under
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
            </Link>
          ) : bunn === 'proev-igjen' && retryHref ? (
            <div style={{ marginTop: 20, textAlign: 'center' }}>
              <Link
                data-testid="tidligere-proev-igjen"
                href={retryHref}
                prefetch={false}
                // Lenketeksten er «Prøv igjen» uten kontekst når en skjermleser
                // lister lenkene på siden — aria-label sier hva som prøves.
                aria-label="Prøv å hente historikken på nytt"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  minHeight: 44, // WCAG 2.5.8 touch-target-minimum
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
              </Link>
            </div>
          ) : null}
        </section>
      )}
    </div>
  )
}
