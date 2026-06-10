import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { getInnloggetBruker, getProfil } from '@/lib/auth-cache'
import { kanAdministrere } from '@/lib/roller'
import Avatar from '@/components/ui/Avatar'
import Icon from '@/components/ui/Icon'
import Chat from '@/components/chat/Chat'
import MeldingReaksjoner from '@/components/agenda/MeldingReaksjoner'
import SlettMeldingKnapp from './SlettMeldingKnapp'
import SlettBildeKnapp from './SlettBildeKnapp'
import { ALBUM_SPOTLIGHT_SELECT, tilAlbumSpotlight } from '@/lib/melding-spotlight'
import { formatDistanceToNowStrict } from 'date-fns'
import { nb } from 'date-fns/locale'

type CoverObj = { bilde_url: string; thumb_url: string | null }
type RawAlbumEmbed = {
  id: string
  tittel: string
  cover: CoverObj | CoverObj[] | null
  antall: { count: number }[] | null
} | null

type MeldingRad = {
  id: string
  innhold: string | null
  opprettet: string
  fra_facebook: boolean | null
  profil_id: string
  profiles: {
    navn: string | null
    bilde_url: string | null
    rolle: string | null
  } | null
  // Sorteres på rekkefoelge her — flat liste av bilder
  melding_bilder: { id: string; bilde_url: string; rekkefoelge: number }[] | null
  album: RawAlbumEmbed | RawAlbumEmbed[]
  spotlight: CoverObj | CoverObj[] | null
}

type ReaksjonRad = {
  emoji: string
  profil_id: string
}

export default async function MeldingDetalj({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [supabase, user, profil] = await Promise.all([
    createServerClient(),
    getInnloggetBruker(),
    getProfil(),
  ])

  const [
    { data: melding },
    { data: reaksjoner },
    { data: chatMeldinger },
    { data: chatProfiler },
  ] = await Promise.all([
    supabase
      .from('meldinger')
      .select(
        `id, innhold, opprettet, fra_facebook, profil_id,
         profiles!meldinger_profil_id_fkey(navn, bilde_url, rolle),
         melding_bilder(id, bilde_url, rekkefoelge),
         ${ALBUM_SPOTLIGHT_SELECT}`,
      )
      .eq('id', id)
      .single<MeldingRad>(),
    supabase
      .from('melding_reaksjon')
      .select('emoji, profil_id')
      .eq('melding_id', id),
    supabase
      .from('melding_chat')
      .select('id, profil_id, innhold, bilde_url, video_url, opprettet')
      .eq('melding_id', id)
      .order('opprettet', { ascending: false })
      .limit(30),
    supabase
      .from('profiles')
      .select('id, navn, bilde_url, rolle')
      .eq('aktiv', true),
  ])

  if (!melding) notFound()

  const erAdmin = kanAdministrere(profil?.rolle)
  // FB-importerte meldinger er fryst i RLS (mig 081 speiler 067 fra klubb_chat).
  // Skjul slette-knappen så brukeren ikke møter en kryptisk RLS-feil ved klikk.
  const kanSlette = (melding.profil_id === user!.id || erAdmin) && !melding.fra_facebook
  // Bilder kan slettes av forfatter (om ikke FB-post) eller admin
  const kanSletteBilder = (melding.profil_id === user!.id || erAdmin) && !melding.fra_facebook

  // Aggreger reaksjoner per emoji
  const grupper = new Map<string, string[]>()
  for (const r of (reaksjoner ?? []) as ReaksjonRad[]) {
    const profilIder = grupper.get(r.emoji) ?? []
    profilIder.push(r.profil_id)
    grupper.set(r.emoji, profilIder)
  }
  const reaksjonGrupper = [...grupper.entries()].map(([emoji, profilIder]) => ({
    emoji,
    profilIder,
  }))

  // Sorter bilder stigende på rekkefoelge — DB returnerer usortert
  const bilder = [...(melding.melding_bilder ?? [])].sort(
    (a, b) => a.rekkefoelge - b.rekkefoelge,
  )

  // Album-spotlight (#214): hvis innlegget peker til et album, viser vi
  // spotlight-bildet og en CTA-pille til albumet i stedet for vanlig
  // bilde-grid. Egne bilder er ikke mulig på album-spotlight-innlegg, så
  // vi trenger ikke å vise begge.
  const spotlight = tilAlbumSpotlight(melding.album, melding.spotlight)

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <header style={{ marginTop: 12, marginBottom: 22 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <Avatar
            name={melding.profiles?.navn ?? ''}
            size={42}
            src={melding.profiles?.bilde_url ?? null}
            rolle={melding.profiles?.rolle ?? null}
          />
          <div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              {melding.profiles?.navn ?? 'Ukjent'}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--text-tertiary)',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                marginTop: 2,
              }}
            >
              {formatDistanceToNowStrict(new Date(melding.opprettet), {
                locale: nb,
                addSuffix: true,
              })}
              {melding.fra_facebook && (
                <span
                  title="Importert fra Facebook"
                  style={{
                    marginLeft: 8,
                    border: '0.5px solid var(--border)',
                    borderRadius: 3,
                    padding: '1px 5px',
                    fontSize: 9,
                    opacity: 0.7,
                  }}
                >
                  Facebook
                </span>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 16,
            color: 'var(--text-primary)',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            marginBottom: 16,
          }}
        >
          {melding.innhold}
        </div>

        {/* Album-spotlight: stort bilde + CTA-pille som lenker til albumet.
            Brukes når innlegget er en lenke til et eksisterende album. */}
        {spotlight && (
          <div style={{ marginBottom: 16 }}>
            {spotlight.bildeUrl && (
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '4/3',
                  borderRadius: 'var(--radius-card)',
                  overflow: 'hidden',
                  marginBottom: 10,
                }}
              >
                <Image
                  src={spotlight.bildeUrl}
                  alt=""
                  fill
                  sizes="(max-width: 512px) 100vw, 512px"
                  style={{ objectFit: 'cover' }}
                  priority
                />
              </div>
            )}
            <Link
              href={`/album/${spotlight.albumId}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 14px',
                background: 'var(--accent-soft)',
                border: '0.5px solid var(--accent)',
                borderRadius: 999,
                color: 'var(--text-primary)',
                textDecoration: 'none',
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              <Icon name="image" size={14} color="var(--accent)" strokeWidth={1.8} />
              <span>
                Se hele albumet
                <span style={{ color: 'var(--text-tertiary)' }}>
                  {' · '}
                  {spotlight.albumTittel}
                  {spotlight.antallBilder > 0 && ` (${spotlight.antallBilder})`}
                </span>
              </span>
            </Link>
          </div>
        )}

        {/* Bilder sortert på rekkefoelge. Hvert bilde har slett-knapp for
            eier/admin (ikke for FB-importerte innlegg). */}
        {!spotlight && bilder.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginBottom: 16,
            }}
          >
            {bilder.map(b => (
              <div key={b.id} style={{ position: 'relative' }}>
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '4/3',
                    borderRadius: 'var(--radius-card)',
                    overflow: 'hidden',
                  }}
                >
                  <Image
                    src={b.bilde_url}
                    alt=""
                    fill
                    sizes="(max-width: 512px) 100vw, 512px"
                    style={{ objectFit: 'cover' }}
                    priority
                  />
                </div>
                {kanSletteBilder && (
                  <SlettBildeKnapp bildeId={b.id} />
                )}
              </div>
            ))}
          </div>
        )}

        <MeldingReaksjoner
          meldingId={melding.id}
          brukerId={user!.id}
          reaksjoner={reaksjonGrupper}
        />
      </header>

      <div id="kommentarer">
        <Chat
          scope={{ type: 'melding', meldingId: melding.id }}
          brukerId={user!.id}
          erAdmin={erAdmin}
          initialMeldinger={[...(chatMeldinger ?? [])].reverse()}
          profiler={chatProfiler ?? []}
        />
      </div>

      {kanSlette && <SlettMeldingKnapp meldingId={melding.id} />}
    </div>
  )
}
