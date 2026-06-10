import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getInnloggetBruker, getProfil } from '@/lib/auth-cache'
import { kanAdministrere } from '@/lib/roller'
import Avatar from '@/components/ui/Avatar'
import Chat from '@/components/chat/Chat'
import ChatAutoScrollScript from '@/components/chat/ChatAutoScrollScript'
import { markerSamtaleLest } from '@/lib/actions/samtaler'

type SamtaleRad = {
  id: string
  profil_a: string
  profil_b: string
}

export default async function SamtaleDetalj({
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
  if (!user) return null

  // RLS sørger for at vi kun ser samtaler vi deltar i — vi får null
  // ellers og rendrer 404.
  const { data: samtale } = await supabase
    .from('samtale')
    .select('id, profil_a, profil_b')
    .eq('id', id)
    .single<SamtaleRad>()

  if (!samtale) notFound()

  const motpartId = samtale.profil_a === user.id ? samtale.profil_b : samtale.profil_a

  const [{ data: motpart }, { data: chatMeldinger }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, navn, visningsnavn, bilde_url, rolle')
      .eq('id', motpartId)
      .single(),
    supabase
      .from('samtale_chat')
      .select('id, profil_id, innhold, bilde_url, video_url, opprettet')
      .eq('samtale_id', id)
      .order('opprettet', { ascending: false })
      .limit(30),
  ])

  // Marker innkomne meldinger som lest når siden lastes. Trigges som side-
  // effekt — UI venter ikke på dette. RLS hindrer at vi kan markere
  // andres meldinger eller andre samtaler.
  markerSamtaleLest(id).catch(console.error)

  const navn = motpart?.visningsnavn || motpart?.navn || 'Ukjent'
  const erAdmin = kanAdministrere(profil?.rolle)

  // Profiler-listen for Chat.tsx — bare meg + motparten siden samtalen
  // har eksakt to deltakere. Mention-systemet får da kun motparten å
  // foreslå (det gir lite mening i en privat samtale, men holder UI
  // konsistent med øvrige scope).
  const chatProfiler = [
    {
      id: user.id,
      navn: profil?.navn ?? null,
      bilde_url: profil?.bilde_url ?? null,
      rolle: profil?.rolle ?? null,
    },
    motpart && {
      id: motpart.id,
      navn: motpart.navn,
      bilde_url: motpart.bilde_url,
      rolle: motpart.rolle,
    },
  ].filter(Boolean) as { id: string; navn: string | null; bilde_url: string | null; rolle: string | null }[]

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <ChatAutoScrollScript />
      <header style={{ marginTop: 12, marginBottom: 22 }}>
        <Link
          href="/samtaler"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.4px',
            textTransform: 'uppercase',
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 16,
          }}
        >
          <span style={{ width: 18, height: '0.5px', background: 'var(--border-strong)' }} />
          Samtaler
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Avatar
            name={navn}
            size={42}
            src={motpart?.bilde_url ?? null}
            rolle={motpart?.rolle ?? null}
          />
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 28,
              fontWeight: 500,
              letterSpacing: '-0.4px',
              lineHeight: 1.15,
              margin: 0,
              color: 'var(--text-primary)',
            }}
          >
            {navn}
          </h1>
        </div>
      </header>

      <Chat
        scope={{ type: 'privat', samtaleId: id }}
        brukerId={user.id}
        erAdmin={erAdmin}
        initialMeldinger={[...(chatMeldinger ?? [])].reverse()}
        profiler={chatProfiler}
        visSeksjonsLabel={false}
        autoScrollTilBunn
      />
    </div>
  )
}
