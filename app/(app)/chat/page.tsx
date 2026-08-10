import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getInnloggetBruker, getProfil } from '@/lib/auth-cache'
import Chat from '@/components/chat/Chat'
import ChatAutoScrollScript from '@/components/chat/ChatAutoScrollScript'
import { kanAdministrere } from '@/lib/roller'
import { markerChatSett } from '@/lib/actions/ulest'
import { hentAppFlagg, CHAT_FANE } from '@/lib/app-innstillinger'
import { logg } from '@/lib/logg'

// Klubb-chat: én felles kronologisk tråd for hele klubben.
// Initial-last er siste 30 meldinger (i desc-rekkefølge fra DB, reversert til
// ascending for UI). «Vis eldre»-knappen i felleskomponenten henter flere.
export default async function KlubbChatSide() {
  const [supabase, user, profil] = await Promise.all([
    createServerClient(),
    getInnloggetBruker(),
    getProfil(),
  ])

  // Flagget hentes parallelt med chat-dataene — gating skjer før render, og
  // innholdet er ikke hemmelig når fanen er av (bare skjult), så det er trygt.
  const [
    { data: siste, error: sisteFeil },
    { data: profiler, error: profilerFeil },
    chatFane,
  ] = await Promise.all([
    supabase
      .from('klubb_chat')
      .select('id, profil_id, innhold, bilde_url, video_url, opprettet, fra_facebook')
      .order('opprettet', { ascending: false })
      .limit(30),
    supabase.from('profiles').select('id, navn, bilde_url, rolle').eq('aktiv', true),
    hentAppFlagg(supabase, CHAT_FANE, true),
  ])
  // Tom chat er normalt (ingen har skrevet ennå), men en feilet spørring skal
  // ikke se identisk ut — kaster for å skille de to (Policy: Databasespørringer).
  if (sisteFeil) throw new Error(`Kunne ikke hente chat: ${sisteFeil.message}`)
  if (profilerFeil) throw new Error(`Kunne ikke hente profiler: ${profilerFeil.message}`)

  // Gating som på /fond, men speilvendt default: chat er på inntil admin skrur
  // av via /innstillinger (app_innstillinger.chat_fane). Admin har alltid tilgang.
  if (!kanAdministrere(profil?.rolle) && !chatFane) return notFound()

  // Marker at brukeren nå ser klubb-chat — prikken forsvinner ved neste
  // navigasjon. Fire-and-forget: vi venter ikke, men heller ikke stille — en
  // tom lambda her ville svelget kastet og gjort feilen usynlig for
  // feil_logg-vakten i e2e/sider-laster.spec.ts (CLAUDE.md § Policy:
  // Side-effekter ved sidelast).
  markerChatSett().catch((err: unknown) =>
    logg.feil('ulest.marker_chat_sett.feilet', err).catch(() => {}),
  )

  const initialMeldinger = [...(siste ?? [])].reverse()

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <ChatAutoScrollScript />
      {/* Breadcrumb + tittel */}
      <div style={{ padding: '12px 4px 22px' }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--text-tertiary)',
            letterSpacing: '2.5px',
            textTransform: 'uppercase',
            marginBottom: 18,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ width: 18, height: '0.5px', background: 'var(--border-strong)' }} />
          Klubbchat
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 36,
            fontWeight: 500,
            letterSpacing: '-0.5px',
            lineHeight: 1,
            margin: 0,
            color: 'var(--text-primary)',
          }}
        >
          Samtalen
        </h1>
      </div>

      <Chat
        scope={{ type: 'klubb' }}
        brukerId={user!.id}
        initialMeldinger={initialMeldinger}
        profiler={profiler ?? []}
        visSeksjonsLabel={false}
        autoScrollTilBunn
      />
    </div>
  )
}
