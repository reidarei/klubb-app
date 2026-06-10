import { createServerClient } from '@/lib/supabase/server'
import SectionLabel from '@/components/ui/SectionLabel'

type StatRad = { id: string; navn: string; totalt: number; siste12: number; arrangert: number }
type StatistikkData = {
  totalt: number
  siste12: number
  deltagelse: StatRad[]
  per_aar: { aar: number; antall: number }[]
}

export default async function Statistikk() {
  const supabase = await createServerClient()

  const { data } = await supabase.rpc('get_statistikk')
  const stats = data as StatistikkData | null

  if (!stats) return null

  const sortert = stats.deltagelse ?? []
  const aarSortert = stats.per_aar ?? []
  const maksAntall = Math.max(...aarSortert.map(a => a.antall), 1)
  const toppArrangoerer = sortert
    .filter(s => s.arrangert > 0)
    .sort((a, b) => b.arrangert - a.arrangert)
    .slice(0, 5)

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <header style={{ marginTop: 12, marginBottom: 26 }}>
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
          Klubbinfo
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
          Statistikk
        </h1>
      </header>

      {/* Nøkkeltall */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          marginBottom: 28,
        }}
      >
        {[
          { val: stats.totalt, lbl: 'Arrangementer totalt' },
          { val: stats.siste12, lbl: 'Siste 12 måneder' },
        ].map(n => (
          <div
            key={n.lbl}
            style={{
              padding: '22px 16px',
              textAlign: 'center',
              background:
                'radial-gradient(ellipse at top, var(--accent-soft), transparent 70%), var(--bg-elevated)',
              border: '0.5px solid var(--border-strong)',
              borderRadius: 'var(--radius)',
              backdropFilter: 'var(--blur-card)',
              WebkitBackdropFilter: 'var(--blur-card)',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 36,
                fontWeight: 500,
                color: 'var(--accent)',
                letterSpacing: '-0.5px',
                lineHeight: 1,
              }}
            >
              {n.val}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--text-tertiary)',
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                marginTop: 8,
                fontWeight: 600,
              }}
            >
              {n.lbl}
            </div>
          </div>
        ))}
      </div>

      {/* Deltagelse */}
      <section style={{ marginBottom: 28 }}>
        <SectionLabel>Deltagelse</SectionLabel>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '9px 1fr auto auto',
            columnGap: 12,
            rowGap: 0,
            padding: '6px 4px',
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.4px',
            fontWeight: 600,
            textTransform: 'uppercase',
            borderBottom: '0.5px solid var(--border-subtle)',
          }}
        >
          <span />
          <span>Navn</span>
          <span style={{ textAlign: 'right', minWidth: 40 }}>Totalt</span>
          <span style={{ textAlign: 'right', minWidth: 44 }}>12 mnd</span>
        </div>
        {sortert.map((s, i) => (
          <div
            key={s.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '9px 1fr auto auto',
              columnGap: 12,
              alignItems: 'center',
              padding: '13px 4px',
              borderBottom:
                i < sortert.length - 1 ? '0.5px solid var(--border-subtle)' : 'none',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--text-tertiary)',
                fontWeight: 600,
              }}
            >
              {String(i + 1).padStart(2, '0')}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 15,
                fontWeight: 500,
                color: 'var(--text-primary)',
                letterSpacing: '-0.1px',
              }}
            >
              {s.navn}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 500,
                color: 'var(--accent)',
                textAlign: 'right',
                minWidth: 40,
              }}
            >
              {s.totalt}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--text-secondary)',
                textAlign: 'right',
                minWidth: 44,
                fontWeight: 500,
              }}
            >
              {s.siste12}
            </div>
          </div>
        ))}
      </section>

      {/* Arrangørtoppen */}
      {toppArrangoerer.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <SectionLabel>Flest arrangert</SectionLabel>
          {toppArrangoerer.map((s, i) => (
            <div
              key={s.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '14px 4px',
                borderBottom:
                  i < toppArrangoerer.length - 1 ? '0.5px solid var(--border-subtle)' : 'none',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  color: 'var(--text-tertiary)',
                  letterSpacing: '1.4px',
                  fontWeight: 600,
                  width: 16,
                }}
              >
                {String(i + 1).padStart(2, '0')}
              </div>
              <div
                style={{
                  flex: 1,
                  fontFamily: 'var(--font-display)',
                  fontSize: 16,
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.2px',
                }}
              >
                {s.navn}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 20,
                  fontWeight: 500,
                  color: 'var(--accent)',
                }}
              >
                {s.arrangert}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Per år */}
      <section>
        <SectionLabel>Per år</SectionLabel>
        {aarSortert.map((a, i) => (
          <div
            key={a.aar}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '14px 4px',
              borderBottom:
                i < aarSortert.length - 1 ? '0.5px solid var(--border-subtle)' : 'none',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: 'var(--accent)',
                letterSpacing: '1.2px',
                fontWeight: 600,
                width: 40,
              }}
            >
              {a.aar}
            </div>
            <div
              style={{
                flex: 1,
                height: 4,
                background: 'var(--border-subtle)',
                borderRadius: 999,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${(a.antall / maksAntall) * 100}%`,
                  background: 'var(--accent)',
                  borderRadius: 999,
                }}
              />
            </div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 500,
                color: 'var(--text-primary)',
                minWidth: 28,
                textAlign: 'right',
              }}
            >
              {a.antall}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
