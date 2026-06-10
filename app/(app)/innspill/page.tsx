import Link from 'next/link'
import { getInnloggetBruker, getProfil } from '@/lib/auth-cache'
import { kanAdministrere } from '@/lib/roller'
import { hentInnspill } from '@/lib/innspill'
import { formaterDato } from '@/lib/dato'
import { createServerClient } from '@/lib/supabase/server'
import SectionLabel from '@/components/ui/SectionLabel'

type Props = {
  searchParams: Promise<{ visning?: 'alle' | 'apne' | 'lukket' }>
}

export default async function InnspillSide({ searchParams }: Props) {
  const [user, profil, sp, supabase] = await Promise.all([
    getInnloggetBruker(),
    getProfil(),
    searchParams,
    createServerClient(),
  ])
  const erAdmin = kanAdministrere(profil?.rolle)
  const visning = sp.visning ?? 'alle'

  // Admin ser alle; vanlig bruker ser kun sine
  const innspill = await hentInnspill(erAdmin ? undefined : user!.id)

  // Hent navn på alle innsendere (for admin-visning)
  const profilIder = [...new Set(innspill.map(i => i.profilId).filter((x): x is string => !!x))]
  const { data: profiler } = profilIder.length
    ? await supabase.from('profiles').select('id, navn').in('id', profilIder)
    : { data: [] }
  const navnMap = new Map((profiler ?? []).map(p => [p.id, p.navn ?? '—']))

  const filtrerte = innspill.filter(i => {
    if (visning === 'apne') return i.status === 'open'
    if (visning === 'lukket') return i.status === 'closed'
    return true
  })

  const aapne = filtrerte.filter(i => i.status === 'open')
  const lukkede = filtrerte.filter(i => i.status === 'closed')

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <header style={{ marginTop: 12, marginBottom: 22 }}>
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
          {erAdmin ? 'Alle innspill' : 'Dine innspill'}
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
          Innspill
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--text-secondary)',
            marginTop: 10,
            lineHeight: 1.5,
            maxWidth: 360,
          }}
        >
          {erAdmin
            ? 'Alle innspill fra gutta. Kommentarene under lukkede innspill er svaret innsenderen får i appen.'
            : 'Innspill du har sendt inn. Når et innspill er håndtert, ser du svaret her.'}
        </p>
      </header>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 22 }}>
        {([
          { key: 'alle', label: 'Alle', n: innspill.length },
          { key: 'apne', label: 'Åpne', n: innspill.filter(i => i.status === 'open').length },
          { key: 'lukket', label: 'Lukket', n: innspill.filter(i => i.status === 'closed').length },
        ] as const).map(f => {
          const aktiv = visning === f.key
          return (
            <Link
              key={f.key}
              href={f.key === 'alle' ? '/innspill' : `/innspill?visning=${f.key}`}
              style={{
                padding: '7px 12px',
                borderRadius: 999,
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '1.4px',
                fontWeight: 600,
                textTransform: 'uppercase',
                background: aktiv ? 'var(--accent-soft)' : 'transparent',
                color: aktiv ? 'var(--accent)' : 'var(--text-tertiary)',
                border: `0.5px solid ${aktiv ? 'var(--border-strong)' : 'var(--border-subtle)'}`,
                textDecoration: 'none',
              }}
            >
              {f.label} · {f.n}
            </Link>
          )
        })}
      </div>

      {filtrerte.length === 0 && (
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            color: 'var(--text-secondary)',
            padding: '28px 0',
            textAlign: 'center',
          }}
        >
          {erAdmin ? 'Ingen innspill i denne visningen.' : 'Du har ingen innspill å vise.'}
        </p>
      )}

      {/* Åpne */}
      {aapne.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <SectionLabel>Åpne</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {aapne.map(i => (
              <InnspillKort key={i.nummer} innspill={i} innsenderNavn={navnMap.get(i.profilId ?? '') ?? null} visInnsender={erAdmin} />
            ))}
          </div>
        </section>
      )}

      {/* Lukkede */}
      {lukkede.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <SectionLabel>Håndtert</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {lukkede.map(i => (
              <InnspillKort key={i.nummer} innspill={i} innsenderNavn={navnMap.get(i.profilId ?? '') ?? null} visInnsender={erAdmin} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function InnspillKort({
  innspill: i,
  innsenderNavn,
  visInnsender,
}: {
  innspill: Awaited<ReturnType<typeof hentInnspill>>[number]
  innsenderNavn: string | null
  visInnsender: boolean
}) {
  const erLukket = i.status === 'closed'
  return (
    <div
      id={`issue-${i.nummer}`}
      style={{
        padding: '16px 18px',
        borderRadius: 14,
        border: '0.5px solid var(--border)',
        background: 'var(--bg-elevated)',
        scrollMarginTop: 24,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span
          style={{
            display: 'inline-block',
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: erLukket ? 'var(--success)' : 'var(--accent)',
            boxShadow: `0 0 0 3px color-mix(in srgb, ${erLukket ? 'var(--success)' : 'var(--accent)'} 18%, transparent)`,
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: erLukket ? 'var(--success)' : 'var(--accent)',
            letterSpacing: '1.6px',
            fontWeight: 600,
            textTransform: 'uppercase',
          }}
        >
          {erLukket ? 'Håndtert' : 'Åpent'} · #{i.nummer}
        </span>
        <span style={{ flex: 1 }} />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.2px',
          }}
        >
          {formaterDato(i.opprettet, 'd. MMM')}
        </span>
      </div>

      <h3
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 18,
          fontWeight: 500,
          color: 'var(--text-primary)',
          letterSpacing: '-0.2px',
          margin: '0 0 8px',
          lineHeight: 1.25,
        }}
      >
        {i.tittel}
      </h3>

      {i.innhold && (
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--text-secondary)',
            lineHeight: 1.55,
            margin: '0 0 10px',
            whiteSpace: 'pre-wrap',
          }}
        >
          {i.innhold}
        </p>
      )}

      {visInnsender && innsenderNavn && (
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.4px',
            fontWeight: 600,
            textTransform: 'uppercase',
            marginBottom: 10,
          }}
        >
          Fra {innsenderNavn}
        </div>
      )}

      {erLukket && i.svar && (
        <div
          style={{
            marginTop: 12,
            padding: '12px 14px',
            borderRadius: 10,
            background: 'color-mix(in srgb, var(--success) 8%, transparent)',
            border: '0.5px solid color-mix(in srgb, var(--success) 25%, transparent)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9.5,
              color: 'var(--success)',
              letterSpacing: '1.6px',
              fontWeight: 600,
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Svar
          </div>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13.5,
              color: 'var(--text-primary)',
              lineHeight: 1.55,
              margin: 0,
              whiteSpace: 'pre-wrap',
            }}
          >
            {i.svar}
          </p>
        </div>
      )}
    </div>
  )
}
