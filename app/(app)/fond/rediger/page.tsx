import { notFound } from 'next/navigation'
import TilbakeKnapp from '@/components/ui/TilbakeKnapp'
import { createServerClient } from '@/lib/supabase/server'
import { getProfil } from '@/lib/auth-cache'
import { kanAdministrere } from '@/lib/roller'
import { FOND_OPPGJOR_URL } from '@/lib/config'
import EiendomEditor from '@/components/fond/EiendomEditor'
import VerdipapirEditor from '@/components/fond/VerdipapirEditor'
import InnskuddEditor from '@/components/fond/InnskuddEditor'
import KontantEditor from '@/components/fond/KontantEditor'
import HentOppgjor from '@/components/fond/HentOppgjor'

export default async function FondRediger() {
  const profil = await getProfil()
  if (!kanAdministrere(profil?.rolle)) return notFound()

  const supabase = await createServerClient()

  const [
    { data: eiendommer, error: eiendommerFeil },
    { data: verdipapirer, error: verdipapirerFeil },
    { data: innskudd, error: innskuddFeil },
    { data: kontant, error: kontantFeil },
    { data: profiler, error: profilerFeil },
  ] = await Promise.all([
    supabase.from('fond_eiendom').select('*').order('navn'),
    supabase.from('fond_verdipapir').select('*').order('navn'),
    supabase.from('fond_innskudd').select('*').order('dato', { ascending: false }),
    supabase.from('fond_kontant').select('saldo').eq('id', 1).maybeSingle(),
    // Kun aktive profiler kan velges som innskytere
    supabase.from('profiles').select('id, navn').eq('aktiv', true).order('navn'),
  ])
  // Redigeringsside for admin — en feilet spørring må aldri vises som en tom
  // liste her: editor-komponentene under kan lagre HELE lista tilbake, og en
  // tom liste fra en svelget feil ville da slettet ekte rader ved neste save.
  if (eiendommerFeil) throw new Error(`Kunne ikke hente eiendommer: ${eiendommerFeil.message}`)
  if (verdipapirerFeil) throw new Error(`Kunne ikke hente verdipapirer: ${verdipapirerFeil.message}`)
  if (innskuddFeil) throw new Error(`Kunne ikke hente innskudd: ${innskuddFeil.message}`)
  if (kontantFeil) throw new Error(`Kunne ikke hente kontantsaldo: ${kontantFeil.message}`)
  if (profilerFeil) throw new Error(`Kunne ikke hente profiler: ${profilerFeil.message}`)

  return (
    <div style={{ padding: '0 20px 40px' }}>
      {/* Topp — samme form som undersidene i kontrollpanelet */}
      <header style={{ marginTop: 12, marginBottom: 22 }}>
        <div style={{ marginBottom: 4 }}>
          <TilbakeKnapp href="/fond" til="Fond" />
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
          Fond
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
          Rediger fondet
        </h1>
      </header>

      {/* Med oppgjørs-henting konfigurert er den PRIMÆRVEIEN for innskudd og
          saldo — den står øverst, og de manuelle editorene for de samme
          tallene flyttes nederst under «Overstyre manuelt» (admins bestilling:
          det som oppdateres automatisk skal ikke friste til enkeltredigering).
          Uten konfigurasjonen (klubb-app/test) er manuell redigering eneste
          vei, og seksjonene vises i vanlig rekkefølge uten overstyrings-ramme. */}
      {FOND_OPPGJOR_URL && (
        <section style={{ marginBottom: 22 }}>
          <Overskrift>Hent publisert oppgjør</Overskrift>
          <div
            style={{
              borderRadius: 14,
              border: '0.5px solid var(--border)',
              background: 'var(--bg-elevated)',
              padding: 16,
            }}
          >
            <HentOppgjor />
          </div>
        </section>
      )}

      {/* Eiendommer og verdipapirer dekkes ikke av oppgjøret — alltid manuelle */}
      <section style={{ marginBottom: 22 }}>
        <Overskrift antall={eiendommer?.length ?? 0}>Eiendommer</Overskrift>
        <EiendomEditor eiendommer={eiendommer ?? []} />
      </section>

      <section style={{ marginBottom: 22 }}>
        <Overskrift antall={verdipapirer?.length ?? 0}>Aksjer og fond</Overskrift>
        <VerdipapirEditor verdipapirer={verdipapirer ?? []} />
      </section>

      {FOND_OPPGJOR_URL && (
        <div style={{ margin: '36px 0 20px' }}>
          <Overskrift>Overstyre manuelt</Overskrift>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              color: 'var(--text-tertiary)',
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            Innskudd og saldo oppdateres normalt via «Hent publisert oppgjør» øverst.
            Rediger enkeltvis kun når du vet at kilden ikke skal gjelde.
          </p>
        </div>
      )}

      {/* Kontantbeholdning */}
      <section style={{ marginBottom: 22 }}>
        <Overskrift>Kontanter</Overskrift>
        <KontantEditor saldo={kontant?.saldo ?? 0} />
      </section>

      {/* Innskudd */}
      <section style={{ marginBottom: 22 }}>
        <Overskrift antall={innskudd?.length ?? 0}>Innskudd</Overskrift>
        <InnskuddEditor innskudd={innskudd ?? []} profiler={profiler ?? []} />
      </section>
    </div>
  )
}

// Gruppeoverskrift — samme form som SkjemaGruppe/PanelGruppe. Editorene under
// rendrer selv boksene (uten tittel), så overskriften står her.
function Overskrift({ antall, children }: { antall?: number; children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: 'var(--text-tertiary)',
        letterSpacing: '1.6px',
        textTransform: 'uppercase',
        fontWeight: 600,
        margin: '0 0 8px 4px',
      }}
    >
      {children}
      {antall !== undefined && antall > 0 && ` · ${antall}`}
    </h2>
  )
}
