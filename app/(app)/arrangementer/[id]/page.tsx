import { createServerClient } from '@/lib/supabase/server'
import { getInnloggetBruker, getProfil } from '@/lib/auth-cache'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import Icon from '@/components/ui/Icon'
import Placeholder from '@/components/ui/Placeholder'
import SladdetFelt from '@/components/SladdetFelt'
import RsvpBlokk from '@/components/arrangement/RsvpBlokk'
import VarsleNuKnapp from './VarsleNuKnapp'
import Chat from '@/components/chat/Chat'
import PassListe, { type PassListeDeltaker } from '@/components/arrangement/PassListe'
import PaameldteListe, { type RsvpStatus } from '@/components/arrangement/PaameldteListe'
import AlbumSeksjon from '@/components/album/AlbumSeksjon'
import { formaterDato } from '@/lib/dato'
import { kanAdministrere } from '@/lib/roller'

type Paamelding = {
  profil_id: string
  status: string
  profiles: {
    navn: string | null
    bilde_url: string | null
    rolle?: string | null
  } | null
}

function sceneFor(type: string): 'tur' | 'møte' | 'event' {
  if (type === 'tur') return 'tur'
  if (type === 'moete') return 'møte'
  return 'event'
}

export default async function ArrangementDetaljer({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ varslet?: string }>
}) {
  const [{ id }, { varslet }] = await Promise.all([params, searchParams])
  const [supabase, user, profil] = await Promise.all([
    createServerClient(),
    getInnloggetBruker(),
    getProfil(),
  ])

  const [
    { data: arr },
    { data: chatMeldinger },
    { data: chatProfiler },
    { data: passInfoRader },
    { data: passForespørsler },
    { data: albumRader },
  ] = await Promise.all([
    supabase
      .from('arrangementer')
      .select(
        `id, type, tittel, beskrivelse, start_tidspunkt, slutt_tidspunkt,
         oppmoetested, destinasjon, pris_per_person, sensurerte_felt, opprettet_av,
         bilde_url,
         opprettet_profil:profiles!arrangementer_opprettet_av_fkey (navn),
         paameldinger (profil_id, status, profiles (navn, bilde_url, rolle))`,
      )
      .eq('id', id)
      .single(),
    supabase
      .from('arrangement_chat')
      .select('id, profil_id, innhold, bilde_url, video_url, opprettet')
      .eq('arrangement_id', id)
      .order('opprettet', { ascending: false })
      .limit(30),
    // chatProfiler: alle aktive medlemmer. Navnet kommer fra at den primært
    // brukes som profil-oppslag for Chat-komponenten, men brukes også til
    // RSVP-listen (alleSvar) i #285 for å vise hvem som ikke har svart.
    supabase
      .from('profiles')
      .select('id, navn, bilde_url, rolle')
      .eq('aktiv', true),
    // Pass-data (#75). RLS filtrerer pass_info til kun de jeg har gyldig
    // dagstilgang til. Forespørsler ser kun mine egne (soker_id = meg)
    // for dette arrangementet.
    supabase.from('pass_info').select('profil_id, nummer, utloper'),
    supabase
      .from('pass_tilgang_forespørsel')
      .select('eier_id, status, gyldig_til, opprettet')
      .eq('arrangement_id', id)
      .eq('soker_id', user!.id)
      .order('opprettet', { ascending: false }),
    // Album for arrangementet (fase 1: forventer 0 eller 1 — vi tar nyeste).
    // Hentes med tilhørende bilder slik at AlbumSeksjon kan rendre grid uten
    // ytterligere round trip.
    supabase
      .from('album')
      .select(
        'id, tittel, cover_bilde_id, opprettet_av, album_bilde!album_bilde_album_id_fkey (id, bilde_url, thumb_url, opprettet)',
      )
      .eq('arrangement_id', id)
      .order('opprettet', { ascending: false })
      .limit(1),
  ])

  // Kåringspoll knyttet til arrangementet (#87). Vi henter separat for å
  // ikke gjøre Promise.all-blokken over mer kompleks; resultatet er
  // typisk 0 eller 1 rad.
  const { data: koblede } = await supabase
    .from('poll')
    .select('id, spoersmaal, svarfrist, avsluttet_paa')
    .eq('arrangement_id', id)
    .not('kaaring_mal_id', 'is', null)
    .order('svarfrist', { ascending: false })
    .limit(1)
  const koblet_kaaringspoll = koblede?.[0] ?? null

  if (!arr) notFound()

  const erAdmin = kanAdministrere(profil?.rolle)
  const erArrangoer = arr.opprettet_av === user!.id
  const kanRedigere = erArrangoer || erAdmin
  const erTur = arr.type === 'tur'

  // Sensureringsregel: kun arrangør ser gjennom sladden.
  // Admin ser IKKE gjennom — bevisst strammet policy.
  const erSensurert = (felt: string) =>
    !erArrangoer && (arr.sensurerte_felt as Record<string, boolean>)?.[felt] === true

  const paameldinger = (arr.paameldinger ?? []) as Paamelding[]
  const minPaamelding = paameldinger.find(p => p.profil_id === user!.id)
  const jaListe = paameldinger.filter(p => p.status === 'ja')

  const mnd = formaterDato(arr.start_tidspunkt, 'MMM').toUpperCase()
  const dag = formaterDato(arr.start_tidspunkt, 'd')
  const tid = formaterDato(arr.start_tidspunkt, 'HH:mm')
  const datoLang = formaterDato(arr.start_tidspunkt, 'd. MMMM yyyy')

  const opprettetProfil = Array.isArray(arr.opprettet_profil)
    ? arr.opprettet_profil[0]
    : arr.opprettet_profil
  const opprettetAvNavn = opprettetProfil?.navn ?? 'Ukjent'

  // Pass-listen vises kun for arrangøren av en kommende tur.
  const visPassListe =
    erTur && erArrangoer && new Date(arr.start_tidspunkt) > new Date()

  // Bygg deltaker-data for PassListe: kombiner pass_info (godkjent
  // dagstilgang) med siste forespørsel-status per eier.
  type PassRad = { profil_id: string; nummer: string; utloper: string }
  type ForespørselRad = {
    eier_id: string
    status: 'venter' | 'godkjent' | 'avslatt'
    gyldig_til: string | null
    opprettet: string
  }
  const passMap = new Map<string, PassRad>()
  for (const p of (passInfoRader ?? []) as PassRad[]) {
    passMap.set(p.profil_id, p)
  }
  const sisteForespørselPerEier = new Map<string, ForespørselRad>()
  for (const f of (passForespørsler ?? []) as ForespørselRad[]) {
    if (!sisteForespørselPerEier.has(f.eier_id)) sisteForespørselPerEier.set(f.eier_id, f)
  }
  const passDeltakere: PassListeDeltaker[] = visPassListe
    ? jaListe
        .filter(p => p.profil_id !== user!.id) // ikke spør om eget pass
        .map(p => {
          const pass = passMap.get(p.profil_id)
          const siste = sisteForespørselPerEier.get(p.profil_id)
          // Hvis pass-info finnes → vi har tilgang nå. Hvis siste status
          // er 'godkjent' men pass_info mangler → tilgangen har utløpt,
          // la arrangøren be på nytt (status: null).
          let status: PassListeDeltaker['forespørselStatus'] = null
          if (!pass && siste) {
            if (siste.status === 'venter') status = 'venter'
            else if (siste.status === 'avslatt') status = 'avslatt'
            // 'godkjent' uten pass-info = utløpt → null (kan be på nytt)
          }
          return {
            id: p.profil_id,
            navn: p.profiles?.navn ?? 'Ukjent',
            bilde_url: p.profiles?.bilde_url ?? null,
            rolle: p.profiles?.rolle ?? null,
            pass: pass ? { nummer: pass.nummer, utloper: pass.utloper } : null,
            forespørselStatus: status,
          }
        })
    : []

  return (
    <div style={{ padding: '0 0 140px' }}>
      {/* Varslet-banner */}
      {varslet === 'true' && (
        <div
          style={{
            margin: '12px 20px 0',
            padding: '12px 14px',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 500,
            background: 'color-mix(in srgb, var(--success) 15%, transparent)',
            color: 'var(--success)',
            border: '1px solid color-mix(in srgb, var(--success) 30%, transparent)',
          }}
        >
          Varsel er sendt
        </div>
      )}

      {/* Hero */}
      <div style={{ position: 'relative', marginBottom: 24 }}>
        {arr.bilde_url ? (
          <div style={{ position: 'relative', aspectRatio: '4/3' }}>
            <Image
              src={arr.bilde_url}
              alt=""
              fill
              style={{ objectFit: 'cover' }}
              sizes="(max-width: 512px) 100vw, 512px"
              priority
            />
          </div>
        ) : (
          <Placeholder label="" aspectRatio="4/3" type={sceneFor(arr.type)} />
        )}

        {/* Mørk gradient nederst */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, transparent 40%, var(--bg) 100%)',
            pointerEvents: 'none',
          }}
        />

        {/* Tilbake-knapp */}
        <Link
          href="/"
          aria-label="Tilbake"
          style={{
            position: 'absolute',
            top: 14,
            left: 16,
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'rgba(10,10,12,0.6)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '0.5px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textDecoration: 'none',
          }}
        >
          <Icon
            name="chevron"
            size={16}
            color="var(--text-primary)"
            style={{ transform: 'rotate(180deg)' }}
          />
        </Link>

        {/* Rediger-pill + Varsle */}
        <div
          style={{
            position: 'absolute',
            top: 14,
            right: 16,
            display: 'flex',
            gap: 8,
          }}
        >
          {kanRedigere && <VarsleNuKnapp arrangementId={id} arrangementTittel={arr.tittel} />}
          {kanRedigere && (
            <Link
              href={`/arrangementer/${id}/rediger`}
              style={{
                padding: '8px 14px',
                borderRadius: 999,
                background: 'rgba(10,10,12,0.6)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '0.5px solid var(--border)',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Rediger
            </Link>
          )}
        </div>

        {/* Dato-chip nederst på bildet */}
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: 20,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--accent)',
            letterSpacing: '1.8px',
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          {mnd} {dag} · {tid}
        </div>
      </div>

      <div style={{ padding: '0 20px' }}>
        {/* Tittel */}
        <div style={{ marginBottom: 22 }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 32,
              fontWeight: 500,
              color: 'var(--text-primary)',
              letterSpacing: '-0.5px',
              margin: '0 0 6px',
              lineHeight: 1.05,
            }}
          >
            {arr.tittel}
          </h1>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--text-tertiary)',
              letterSpacing: '0.1px',
            }}
          >
            {datoLang}
            {arr.oppmoetested && <> · {arr.oppmoetested}</>}
          </div>
        </div>

        {/* RSVP */}
        <RsvpBlokk
          arrangementId={id}
          minStatus={minPaamelding?.status as 'ja' | 'kanskje' | 'nei' | undefined}
        />

        {/* Fakta */}
        <div
          style={{
            marginBottom: 26,
            borderTop: '0.5px solid var(--border-subtle)',
            borderBottom: '0.5px solid var(--border-subtle)',
          }}
        >
          {(
            [
              arr.oppmoetested
                ? {
                    label: 'Oppmøte',
                    value: arr.oppmoetested,
                    icon: 'mapPin' as const,
                  }
                : null,
              erTur
                ? {
                    label: 'Destinasjon',
                    value: erSensurert('destinasjon')
                      ? 'sladd'
                      : arr.destinasjon ?? '–',
                    icon: 'plane' as const,
                    sladd: erSensurert('destinasjon'),
                  }
                : null,
              erTur
                ? {
                    label: 'Pris',
                    value: erSensurert('pris_per_person')
                      ? 'sladd'
                      : arr.pris_per_person
                      ? `${arr.pris_per_person.toLocaleString('nb')} kr`
                      : '–',
                    sub: arr.pris_per_person ? 'per person' : undefined,
                    icon: 'wine' as const,
                    sladd: erSensurert('pris_per_person'),
                  }
                : null,
              {
                label: 'Opprettet av',
                value: opprettetAvNavn,
                icon: 'user' as const,
              },
            ].filter(Boolean) as Array<{
              label: string
              value: string
              sub?: string
              icon: 'mapPin' | 'plane' | 'wine' | 'user'
              sladd?: boolean
            }>
          ).map((f, i, a) => (
            <div
              key={f.label}
              style={{
                padding: '14px 0',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                borderBottom:
                  i < a.length - 1 ? '0.5px solid var(--border-subtle)' : 'none',
              }}
            >
              <Icon name={f.icon} size={14} color="var(--text-tertiary)" strokeWidth={1.5} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9.5,
                    color: 'var(--text-tertiary)',
                    letterSpacing: '1.6px',
                    textTransform: 'uppercase',
                    marginBottom: 2,
                    fontWeight: 600,
                  }}
                >
                  {f.label}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 14,
                    color: 'var(--text-primary)',
                  }}
                >
                  {f.sladd ? <SladdetFelt /> : f.value}
                  {f.sub && (
                    <span style={{ color: 'var(--text-tertiary)', marginLeft: 6 }}>
                      · {f.sub}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Legg til i kalender */}
        <a
          href={`/api/arrangementer/${id}/ics`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 999,
            background: 'var(--bg-elevated)',
            border: '0.5px solid var(--border)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            textDecoration: 'none',
            marginBottom: 26,
          }}
        >
          <Icon name="calendar" size={14} color="var(--accent)" strokeWidth={1.5} />
          Legg til i kalender
        </a>

        {/* Beskrivelse */}
        {arr.beskrivelse && (
          <>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--text-tertiary)',
                letterSpacing: '2px',
                textTransform: 'uppercase',
                marginBottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontWeight: 600,
              }}
            >
              Beskrivelse
              <span style={{ flex: 1, height: '0.5px', background: 'var(--border-subtle)' }} />
            </div>
            <p
              style={{
                margin: '0 0 28px',
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                lineHeight: 1.65,
                color: 'var(--text-secondary)',
                letterSpacing: '0.1px',
                whiteSpace: 'pre-wrap',
              }}
            >
              {arr.beskrivelse}
            </p>
          </>
        )}

        {/* Påmeldt-seksjon (#285).
            Bygg jaListe (avatar-raden) og alleSvar (modalen) FØR vi tegner —
            slik at antall-badgen i headeren alltid stemmer overens (se #272).
            alleSvar itererer chatProfiler (alle aktive medlemmer) og slår opp
            status fra paameldinger — default 'ikke_svart' ved manglende rad. */}
        {(() => {
          // Slå opp status per profil_id fra paameldinger-lista
          const statusMap = new Map<string, RsvpStatus>()
          for (const p of paameldinger) {
            const s = p.status as RsvpStatus
            if (s === 'ja' || s === 'kanskje' || s === 'nei') statusMap.set(p.profil_id, s)
          }

          // jaListeMedNavn: kun ja-folk med navn — driver avatar-raden (uendret)
          const jaListeMedNavn = jaListe
            .filter(p => p.profiles?.navn)
            .map(p => ({
              profil_id: p.profil_id,
              navn: p.profiles?.navn ?? '?', // ?? '?' beholdt for type-narrowing
              bilde_url: p.profiles?.bilde_url ?? null,
              rolle: p.profiles?.rolle ?? null,
              status: 'ja' as RsvpStatus,
            }));

          // alleSvar: alle aktive medlemmer med navn, status default 'ikke_svart'.
          // Bruker chatProfiler som kilde fordi den allerede er hentet for Chat-komponenten.
          const alleSvar = (chatProfiler ?? [])
            .filter(p => p.navn)
            .map(p => ({
              profil_id: p.id,
              navn: p.navn ?? '?', // ?? '?' for type-narrowing — filter over sikrer at den aldri trigger
              bilde_url: p.bilde_url ?? null,
              rolle: p.rolle ?? null,
              status: statusMap.get(p.id) ?? ('ikke_svart' as RsvpStatus),
            }));

          // Vis seksjonen så lenge det finnes aktive medlemmer (#285).
          // Tidligere ble seksjonen skjult hvis ingen hadde sagt ja — men det
          // hindret brukeren i å se hvem som IKKE hadde svart ennå.
          if (alleSvar.length === 0) return null;
          return (
            <>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--text-tertiary)',
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  marginBottom: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontWeight: 600,
                }}
              >
                <span>Påmeldt</span>
                <span style={{ color: 'var(--text-secondary)' }}>{jaListeMedNavn.length}</span>
                <span style={{ flex: 1, height: '0.5px', background: 'var(--border-subtle)' }} />
              </div>
              {/* Avatar-rad (ja-folk) + modal (alle svar gruppert etter status, #285).
                  kanPurre=kanRedigere slik at kun admin/oppretter ser «Purre disse». (#287) */}
              <PaameldteListe
                jaListe={jaListeMedNavn}
                alleSvar={alleSvar}
                arrangementId={id}
                arrangementTittel={arr.tittel}
                kanPurre={kanRedigere}
              />
            </>
          );
        })()}

        {/* Pass-info for deltakere — kun for arrangør på kommende tur */}
        {visPassListe && passDeltakere.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                letterSpacing: '1.6px',
                textTransform: 'uppercase',
                marginBottom: 10,
              }}
            >
              Pass-info for deltakere
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                lineHeight: 1.4,
                marginBottom: 12,
              }}
            >
              Trykk «Be om passinfo» for hver deltaker du trenger pass for.
              Generalsekretæren godkjenner — du får tilgang i 24 timer.
            </div>
            <PassListe arrangementId={id} deltakere={passDeltakere} />
          </section>
        )}

        {/* Tilknyttet kåringspoll (#87) — vises bare hvis koblet */}
        {koblet_kaaringspoll && (
          <section style={{ marginBottom: 24 }}>
            <Link
              href={`/poll/${koblet_kaaringspoll.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                border: '0.5px solid var(--accent)',
                borderRadius: 'var(--radius-card)',
                background: 'var(--accent-soft)',
                color: 'var(--text-primary)',
                textDecoration: 'none',
                fontFamily: 'var(--font-body)',
                fontSize: 14,
              }}
            >
              <Icon name="trophy" size={20} color="var(--accent)" />
              <span style={{ flex: 1 }}>
                {koblet_kaaringspoll.avsluttet_paa
                  ? 'Kåring: avgjort'
                  : 'Kåring: åpen for stemming'}
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {koblet_kaaringspoll.spoersmaal}
                </div>
              </span>
              <Icon name="chevron" size={16} color="var(--text-tertiary)" />
            </Link>
          </section>
        )}

        {/* Album */}
        <AlbumSeksjon
          arrangementId={id}
          kanRedigere={
            !!(albumRader && albumRader[0] &&
              (albumRader[0].opprettet_av === user!.id || erAdmin))
          }
          album={
            albumRader && albumRader[0]
              ? {
                  id: albumRader[0].id,
                  tittel: albumRader[0].tittel,
                  cover_bilde_id: albumRader[0].cover_bilde_id,
                  bilder: ((albumRader[0].album_bilde ?? []) as Array<{
                    id: string
                    bilde_url: string
                    thumb_url: string | null
                    opprettet: string
                  }>)
                    .slice()
                    .sort((a, b) => a.opprettet.localeCompare(b.opprettet))
                    .map(b => ({ id: b.id, bilde_url: b.bilde_url, thumb_url: b.thumb_url })),
                }
              : null
          }
        />

        {/* Kommentarer */}
        <div id="kommentarer">
          <Chat
            scope={{ type: 'arrangement', arrangementId: id }}
            brukerId={user!.id}
            erAdmin={erAdmin}
            initialMeldinger={[...(chatMeldinger ?? [])].reverse()}
            profiler={chatProfiler ?? []}
          />
        </div>
      </div>
    </div>
  )
}
