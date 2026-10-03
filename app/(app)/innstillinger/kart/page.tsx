import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getProfil } from '@/lib/auth-cache'
import { kanAdministrere } from '@/lib/roller'
import { SYMBOLER_VARSLER } from '@/lib/markering-symboler'
import { hentKartSymboler } from '@/lib/kart-symbol-tilpasning'
import TilbakeKnapp from '@/components/ui/TilbakeKnapp'
import InnstillingsKort from '@/components/innstillinger/InnstillingsKort'
import KartSymbolSkjema from './KartSymbolSkjema'

// Kartinnstillinger: navn og emoji på de varslende markeringene. Gjelder
// kartet uansett modus — reisemodus og møtemodus viser samme /kart.
export default async function KartInnstillinger() {
  const [supabase, profil] = await Promise.all([createServerClient(), getProfil()])
  if (!kanAdministrere(profil?.rolle)) notFound()

  const symboler = await hentKartSymboler(supabase)
  // Standardverdiene fra registeret, for «Tilbake til standard».
  const varslende = SYMBOLER_VARSLER.map(standard => ({
    standard,
    gjeldende: symboler.find(s => s.id === standard.id) ?? standard,
  }))

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <header style={{ marginTop: 12, marginBottom: 22 }}>
        <div style={{ marginBottom: 4 }}>
          <TilbakeKnapp href="/innstillinger" til="Innstillinger" />
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.6px',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          Innstillinger
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: '-0.4px',
            margin: 0,
            color: 'var(--text-primary)',
          }}
        >
          Kart
        </h1>
      </header>

      <InnstillingsKort
        tittel="Markeringer som varsler"
        defaultApen
        oppsummering={varslende.map(v => `${v.gjeldende.emoji} ${v.gjeldende.etikett}`).join(' · ')}
        beskrivelse="Navn og symbol på markeringene som sender varsel til hele gjengen. Gjelder kartet i både reisemodus og møtemodus — og markeringer som allerede står på kartet."
      >
        {varslende.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
            Klubben har ingen markeringer som varsler.
          </p>
        ) : (
          varslende.map(({ standard, gjeldende }, i) => (
            <KartSymbolSkjema
              key={standard.id}
              symbol={standard.id}
              etikett={gjeldende.etikett}
              emoji={gjeldende.emoji}
              standardEtikett={standard.etikett}
              standardEmoji={standard.emoji}
              siste={i === varslende.length - 1}
            />
          ))
        )}
      </InnstillingsKort>
    </div>
  )
}
