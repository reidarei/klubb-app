import { createServerClient } from '@/lib/supabase/server'
import { getInnloggetBruker } from '@/lib/auth-cache'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { formaterDato } from '@/lib/dato'
import MarkerLestEffekt from '@/components/varsler/MarkerLestEffekt'

export default async function VarselSide({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [supabase, user] = await Promise.all([createServerClient(), getInnloggetBruker()])

  const { data: varsel } = await supabase
    .from('varsel_logg')
    .select('id, tittel, melding, lest, opprettet, url')
    .eq('id', id)
    .eq('profil_id', user!.id)
    .single()

  if (!varsel) notFound()

  // Mutasjon + revalidatePath flyttet til klient-mountet server action
  // (MarkerLestEffekt) — Next.js 15+ forbyr revalidatePath under render
  // og kastet «Noe gikk galt» på alle uleste varsler. Se #261.
  const skalMarkereLest = !varsel.lest

  return (
    <div style={{ padding: '0 20px 20px' }}>
      {skalMarkereLest && <MarkerLestEffekt varselId={varsel.id} />}
      <div style={{ marginTop: 12, marginBottom: 20 }}>
        <Link
          href="/profil"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.6px',
            textTransform: 'uppercase',
            textDecoration: 'none',
          }}
        >
          ← Profil
        </Link>
      </div>

      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 600,
          color: 'var(--accent)',
          letterSpacing: '1.6px',
          textTransform: 'uppercase',
          marginBottom: 10,
        }}
      >
        Varsel
      </div>
      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 30,
          fontWeight: 500,
          letterSpacing: '-0.4px',
          lineHeight: 1.1,
          margin: 0,
          marginBottom: 18,
          color: 'var(--text-primary)',
        }}
      >
        {varsel.tittel}
      </h1>

      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 15,
          lineHeight: 1.6,
          color: 'var(--text-secondary)',
          marginBottom: 24,
        }}
      >
        {varsel.melding}
      </p>

      {varsel.url && (
        <Link
          href={varsel.url}
          style={{
            display: 'inline-block',
            padding: '11px 20px',
            background: 'var(--accent)',
            color: 'var(--accent-foreground)',
            borderRadius: 999,
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
            marginBottom: 20,
          }}
        >
          Gå til saken
        </Link>
      )}

      {varsel.opprettet && (
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.4px',
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          {formaterDato(varsel.opprettet, "d. MMMM yyyy · HH:mm")}
        </div>
      )}
    </div>
  )
}
