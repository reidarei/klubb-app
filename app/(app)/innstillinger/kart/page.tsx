import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getProfil } from '@/lib/auth-cache'
import { kanAdministrere } from '@/lib/roller'
import { SYMBOLER_VARSLER } from '@/lib/markering-symboler'
import { hentKartSymboler } from '@/lib/kart-symbol-tilpasning'
import UndersideHode from '@/components/innstillinger/UndersideHode'
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
      <UndersideHode tittel="Kartalarmer" />

      <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.45, color: 'var(--text-secondary)', margin: '0 4px 18px' }}>
        Markeringene som sender varsel til hele gjengen når noen setter dem på kartet. Her gir du dem navn og symbol. Gjelder kartet i både reisemodus og møtemodus — og markeringer som allerede står på kartet.
      </p>

      {varslende.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
          Klubben har ingen markeringer som varsler.
        </p>
      ) : (
        varslende.map(({ standard, gjeldende }, i) => (
          <KartSymbolSkjema
            key={standard.id}
            symbol={standard.id}
            nummer={i + 1}
            etikett={gjeldende.etikett}
            emoji={gjeldende.emoji}
            standardEtikett={standard.etikett}
            standardEmoji={standard.emoji}
          />
        ))
      )}
    </div>
  )
}
