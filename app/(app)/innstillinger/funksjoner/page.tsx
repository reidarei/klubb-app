import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getProfil } from '@/lib/auth-cache'
import { kanAdministrere } from '@/lib/roller'
import { hentAppFlagg, FOND_FANE, CHAT_FANE, REISEMODUS, MOETEMODUS, BURSDAGSBILDE } from '@/lib/app-innstillinger'
import { BURSDAGSBILDE_PAA } from '@/lib/config'
import UndersideHode from '@/components/innstillinger/UndersideHode'
import BryterBoks from '@/components/innstillinger/BryterBoks'
import FunksjonToggle from '@/components/innstillinger/FunksjonToggle'

// App-vide på/av-flagg. Forklaringen under hver bryter skal si hva medlemmene
// merker — admin skal ikke måtte gjette hva en bryter gjør før han trykker.
export default async function Funksjoner() {
  const [supabase, profil] = await Promise.all([createServerClient(), getProfil()])
  if (!kanAdministrere(profil?.rolle)) notFound()

  const [fond, chat, reisemodus, moetemodus, bursdagsbilde] = await Promise.all([
    hentAppFlagg(supabase, FOND_FANE),
    hentAppFlagg(supabase, CHAT_FANE, true),
    // fallback false — kill-switch, ikke synlighetsbryter: en feilet
    // spørring skal ALDRI kunne sende noen til fullskjermkart (#723).
    hentAppFlagg(supabase, REISEMODUS, false),
    // Samme fail-closed begrunnelse som REISEMODUS over (#780).
    hentAppFlagg(supabase, MOETEMODUS, false),
    // Fail-closed: et KI-kall skal aldri skje fordi flagget ikke lot seg lese.
    hentAppFlagg(supabase, BURSDAGSBILDE, false),
  ])

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <UndersideHode tittel="Funksjoner" ingress="Gjelder alle medlemmer." />

      <BryterBoks tittel="Faner" fotnote="Admin ser alltid begge fanene, også når de er av.">
        <FunksjonToggle
          noekkel={FOND_FANE}
          aktiv={fond}
          beskrivelse="Fond-fanen"
          forklaring="Av: bare admin ser fondet. Gutta ser ikke fanen."
        />
        <FunksjonToggle
          noekkel={CHAT_FANE}
          aktiv={chat}
          beskrivelse="Chat-fanen"
          forklaring="Av: bare admin ser klubbchatten. Gutta ser ikke fanen."
          last
        />
      </BryterBoks>

      {/* Kill-switcher (#723, #780): av for alle, også admin, når de står av. */}
      <BryterBoks tittel="Kartet i fullskjerm" fotnote="Pågår en tur og et møte samtidig, vinner turen.">
        <FunksjonToggle
          noekkel={REISEMODUS}
          aktiv={reisemodus}
          beskrivelse="Reisemodus"
          forklaring="På: mens en tur med sluttid pågår, åpner appen rett i kartet. Hver mann kan slå det av for seg selv."
        />
        <FunksjonToggle
          noekkel={MOETEMODUS}
          aktiv={moetemodus}
          beskrivelse="Møtemodus"
          forklaring="På: fra møtestart til kl. 06 dagen etter åpner appen rett i kartet."
          last
        />
      </BryterBoks>

      {/* Bare når instansen har Vertex-credentials — uten dem finnes det
          ingenting å skru på, og en bryter som ikke gjør noe er en løgn. */}
      {BURSDAGSBILDE_PAA && (
        <BryterBoks tittel="KI">
          <FunksjonToggle
            noekkel={BURSDAGSBILDE}
            aktiv={bursdagsbilde}
            beskrivelse="KI-bursdagsbilde"
            forklaring="På: bursdagsbarnets profilbilde sendes til Google (EU), som lager et bursdagsbilde til bursdagskortet."
            last
          />
        </BryterBoks>
      )}
    </div>
  )
}
