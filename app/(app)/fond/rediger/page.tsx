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

      {/* Kontantbeholdning */}
      <section style={{ marginBottom: 28 }}>
        <SectionLabel>Kontantbeholdning</SectionLabel>
        <Card>
          <KontantEditor saldo={kontant?.saldo ?? 0} />
        </Card>
      </section>

      {/* Eiendommer */}
      <section style={{ marginBottom: 28 }}>
        <SectionLabel count={eiendommer?.length ?? 0}>Eiendommer</SectionLabel>
        <EiendomEditor eiendommer={eiendommer ?? []} />
      </section>

      {/* Verdipapirer */}
      <section style={{ marginBottom: 28 }}>
        <SectionLabel count={verdipapirer?.length ?? 0}>Aksjer og fond</SectionLabel>
        <VerdipapirEditor verdipapirer={verdipapirer ?? []} />
      </section>

      {/* Innskudd */}
      <section style={{ marginBottom: 28 }}>
        <SectionLabel count={innskudd?.length ?? 0}>Innskudd</SectionLabel>
        <InnskuddEditor innskudd={innskudd ?? []} profiler={profiler ?? []} />
      </section>

      {/* Hent publisert oppgjør — vises kun når FOND_OPPGJOR_REPO er konfigurert */}
      {FOND_OPPGJOR_REPO && (
        <section>
          <SectionLabel>Hent publisert oppgjør</SectionLabel>
          <Card>
            <HentOppgjor />
          </Card>
        </section>
      )}
    </div>
  )
}
