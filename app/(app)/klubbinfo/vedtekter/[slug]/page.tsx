import { createServerClient } from '@/lib/supabase/server'
import { getProfil } from '@/lib/auth-cache'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Icon from '@/components/ui/Icon'
import VedtektVisning from './VedtektVisning'
import { kanAdministrere } from '@/lib/roller'

export default async function VedtektSide({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [supabase, profil] = await Promise.all([createServerClient(), getProfil()])
  const erAdmin = kanAdministrere(profil?.rolle)

  const { data: vedtekt } = await supabase
    .from('vedtekter')
    .select('id, slug, tittel, innhold, oppdatert')
    .eq('slug', slug)
    .single()

  if (!vedtekt) notFound()

  const { data: versjoner } = await supabase
    .from('vedtekter_versjoner')
    .select('id, vedtaksdato, endringsnotat, opprettet, profiles (navn)')
    .eq('vedtekt_id', vedtekt.id)
    .order('opprettet', { ascending: false })
    .limit(10)

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <div style={{ marginTop: 12, marginBottom: 20 }}>
        <Link
          href="/klubbinfo"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: 'var(--text-tertiary)',
            textDecoration: 'none',
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            letterSpacing: '1.6px',
            fontWeight: 600,
            textTransform: 'uppercase',
            marginBottom: 14,
          }}
        >
          <Icon name="chevron" size={12} color="var(--text-tertiary)" />
          <span style={{ transform: 'scaleX(-1)', display: 'inline-block' }} />
          Klubbinfo
        </Link>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.6px',
            textTransform: 'uppercase',
            marginBottom: 6,
            marginTop: 12,
          }}
        >
          Klubbinfo
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 38,
            fontWeight: 500,
            letterSpacing: '-0.5px',
            lineHeight: 1.05,
            margin: 0,
            color: 'var(--text-primary)',
          }}
        >
          {vedtekt.tittel}
        </h1>
      </div>

      <VedtektVisning
        vedtekt={vedtekt}
        erAdmin={erAdmin}
        versjoner={versjoner ?? []}
      />
    </div>
  )
}
