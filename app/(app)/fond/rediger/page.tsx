import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { getProfil } from '@/lib/auth-cache'
import { kanAdministrere } from '@/lib/roller'
import { FOND_OPPGJOR_REPO } from '@/lib/config'
import SectionLabel from '@/components/ui/SectionLabel'
import Card from '@/components/ui/Card'
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
    { data: eiendommer },
    { data: verdipapirer },
    { data: innskudd },
    { data: kontant },
    { data: profiler },
  ] = await Promise.all([
    supabase.from('fond_eiendom').select('*').order('navn'),
    supabase.from('fond_verdipapir').select('*').order('navn'),
    supabase.from('fond_innskudd').select('*').order('dato', { ascending: false }),
    supabase.from('fond_kontant').select('saldo').eq('id', 1).maybeSingle(),
    // Kun aktive profiler kan velges som innskytere
    supabase.from('profiles').select('id, navn').eq('aktiv', true).order('navn'),
  ])

  return (
    <div style={{ padding: '0 20px 40px' }}>
      {/* Topp */}
      <div style={{ padding: '16px 4px 20px', borderBottom: '0.5px solid var(--border-subtle)', marginBottom: 24 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-tertiary)', letterSpacing: '2.5px', textTransform: 'uppercase', marginBottom: 8 }}>
          <Link href="/fond" style={{ color: 'inherit', textDecoration: 'none' }}>← Fond</Link>
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--text-primary)', letterSpacing: '-0.5px' }}>
          Rediger fond
        </div>
      </div>

      {/* Med oppgjørs-henting konfigurert er den PRIMÆRVEIEN for innskudd og
          saldo — den står øverst, og de manuelle editorene for de samme
          tallene flyttes nederst under «Overstyre manuelt» (Reidars bestilling:
          det som oppdateres automatisk skal ikke friste til enkeltredigering).
          Uten konfigurasjonen (klubb-app/test) er manuell redigering eneste
          vei, og seksjonene vises i vanlig rekkefølge uten overstyrings-ramme. */}
      {FOND_OPPGJOR_REPO && (
        <section style={{ marginBottom: 28 }}>
          <SectionLabel>Hent publisert oppgjør</SectionLabel>
          <Card>
            <HentOppgjor />
          </Card>
        </section>
      )}

      {/* Eiendommer og verdipapirer dekkes ikke av oppgjøret — alltid manuelle */}
      <section style={{ marginBottom: 28 }}>
        <SectionLabel count={eiendommer?.length ?? 0}>Eiendommer</SectionLabel>
        <EiendomEditor eiendommer={eiendommer ?? []} />
      </section>

      <section style={{ marginBottom: 28 }}>
        <SectionLabel count={verdipapirer?.length ?? 0}>Aksjer og fond</SectionLabel>
        <VerdipapirEditor verdipapirer={verdipapirer ?? []} />
      </section>

      {FOND_OPPGJOR_REPO && (
        <div style={{ margin: '36px 0 20px' }}>
          <SectionLabel>Overstyre manuelt</SectionLabel>
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
      <section style={{ marginBottom: 28 }}>
        <SectionLabel>Kontantbeholdning</SectionLabel>
        <Card>
          <KontantEditor saldo={kontant?.saldo ?? 0} />
        </Card>
      </section>

      {/* Innskudd */}
      <section style={{ marginBottom: 28 }}>
        <SectionLabel count={innskudd?.length ?? 0}>Innskudd</SectionLabel>
        <InnskuddEditor innskudd={innskudd ?? []} profiler={profiler ?? []} />
      </section>
    </div>
  )
}
