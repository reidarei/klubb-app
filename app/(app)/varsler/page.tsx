import { createServerClient } from '@/lib/supabase/server'
import { getInnloggetBruker } from '@/lib/auth-cache'
import TilbakeKnapp from '@/components/ui/TilbakeKnapp'
import VarslerListe from '@/components/profil/VarslerListe'

// Hele varsel-lista (flyttet hit fra /profil). Viktig/Alt-faner, filter og
// «Marker alle som lest» ligger i VarslerListe — uendret funksjonelt.
export default async function VarslerSide() {
  const [supabase, user] = await Promise.all([createServerClient(), getInnloggetBruker()])

  const [
    { data: varslerViktig, error: varslerViktigFeil },
    { data: varslerAlt, error: varslerAltFeil },
    { count: antallUlesteViktig, error: antallUlesteViktigFeil },
    { count: antallUlesteAlt, error: antallUlesteAltFeil },
  ] = await Promise.all([
    // «Viktig» — default-fanen. teller_ulest = true dekker alt utenom de fem
    // chat_*-broadcastene (#612, migrasjon 134); en pass-godkjenning skal
    // ikke kunne drukne i en klubbchat-burst.
    supabase
      .from('varsel_logg')
      .select('id, tittel, melding, lest, opprettet, url')
      .eq('profil_id', user!.id)
      .eq('teller_ulest', true)
      .order('opprettet', { ascending: false })
      .limit(10),
    // «Alt» — hele historikken, chat inkludert.
    supabase
      .from('varsel_logg')
      .select('id, tittel, melding, lest, opprettet, url')
      .eq('profil_id', user!.id)
      .order('opprettet', { ascending: false })
      .limit(10),
    // Total ulest-count for «Viktig» på tvers av hele historikken — listen
    // viser kun top 10, men «Marker alle som lest» og tellingen i tittelen må
    // kjenne til alle uleste, også de eldre enn topp 10 (#207). MÅ filtreres
    // likt som prikken (harUlestVarsler() i lib/ulest.ts) — ellers lyver
    // tittelen og avatar-prikken mot hverandre (#612).
    supabase
      .from('varsel_logg')
      .select('id', { count: 'exact', head: true })
      .eq('profil_id', user!.id)
      .eq('teller_ulest', true)
      .eq('lest', false),
    // Uleste i «Alt» — ALLE uleste, ikke bare chat-radene (#612-review): badgen
    // står på en fane som viser hele historikken, så den må telle det fanen
    // faktisk inneholder.
    supabase
      .from('varsel_logg')
      .select('id', { count: 'exact', head: true })
      .eq('profil_id', user!.id)
      .eq('lest', false),
  ])

  if (varslerViktigFeil) throw new Error(`Kunne ikke hente varsler («Viktig»): ${varslerViktigFeil.message}`)
  if (varslerAltFeil) throw new Error(`Kunne ikke hente varsler («Alt»): ${varslerAltFeil.message}`)
  if (antallUlesteViktigFeil) throw new Error(`Kunne ikke telle uleste varsler («Viktig»): ${antallUlesteViktigFeil.message}`)
  if (antallUlesteAltFeil) throw new Error(`Kunne ikke telle uleste varsler («Alt»): ${antallUlesteAltFeil.message}`)

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <header style={{ marginTop: 12, marginBottom: 6 }}>
        <TilbakeKnapp href="/profil" til="Profil" />
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.6px',
            textTransform: 'uppercase',
            margin: '14px 0 6px',
          }}
        >
          Innboks
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 38,
            fontWeight: 500,
            letterSpacing: '-0.5px',
            lineHeight: 1,
            margin: 0,
            color: 'var(--text-primary)',
          }}
        >
          Varsler
        </h1>
      </header>

      <VarslerListe
        varslerViktig={varslerViktig ?? []}
        varslerAlt={varslerAlt ?? []}
        antallUlesteViktigTotal={antallUlesteViktig ?? 0}
        antallUlesteAltTotal={antallUlesteAlt ?? 0}
      />
    </div>
  )
}
