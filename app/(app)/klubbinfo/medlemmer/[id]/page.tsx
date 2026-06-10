import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { getInnloggetBruker, getProfil } from '@/lib/auth-cache'
import { notFound } from 'next/navigation'
import Avatar from '@/components/ui/Avatar'
import SectionLabel from '@/components/ui/SectionLabel'
import SendMeldingKnapp from './SendMeldingKnapp'
import { formaterDato } from '@/lib/dato'
import { kanAdministrere, tittelFor } from '@/lib/roller'

export default async function MedlemProfil({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [supabase, meg, megUser] = await Promise.all([
    createServerClient(),
    getProfil(),
    getInnloggetBruker(),
  ])
  const erAdmin = kanAdministrere(meg?.rolle)
  const erMegSelv = megUser?.id === id

  const [
    { data: medlem },
    { data: egneKaaringer },
    { data: arrKaaringer },
    { data: arrangementer },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, navn, visningsnavn, epost, telefon, rolle, fodselsdato, aktiv, bilde_url')
      .eq('id', id)
      .single(),

    // Kåringer medlemmet selv har vunnet (f.eks. «Årets herre»)
    supabase
      .from('kaaring_vinnere')
      .select('id, aar, begrunnelse, kaaringmaler(navn)')
      .eq('profil_id', id)
      .order('aar', { ascending: false }),

    // Kåringer der et arrangement medlemmet arrangerte vant (f.eks.
    // «Årets arrangement»). Inner join på arrangementer filtrerer til bare
    // de der `opprettet_av = id`.
    supabase
      .from('kaaring_vinnere')
      .select('id, aar, begrunnelse, kaaringmaler(navn), arrangementer!inner(id, tittel, opprettet_av)')
      .eq('arrangementer.opprettet_av', id)
      .order('aar', { ascending: false }),

    supabase
      .from('arrangementer')
      .select('id, tittel, type, start_tidspunkt')
      .eq('opprettet_av', id)
      .order('start_tidspunkt', { ascending: false }),
  ])

  // Slå sammen de to kåringslistene, sortert synkende på år. Hver oppføring
  // er tagget med `kilde` slik at UI kan vise arrangement-tittelen når den
  // finnes.
  type KaaringVisning = {
    id: string
    aar: number
    navn: string
    begrunnelse: string | null
    arrangementTittel: string | null
    arrangementId: string | null
  }

  const egneListe: KaaringVisning[] = (egneKaaringer ?? []).map(k => {
    const mal = Array.isArray(k.kaaringmaler) ? k.kaaringmaler[0] : k.kaaringmaler
    return {
      id: k.id,
      aar: k.aar,
      navn: mal?.navn ?? 'Ukjent kåring',
      begrunnelse: k.begrunnelse,
      arrangementTittel: null,
      arrangementId: null,
    }
  })

  const arrListe: KaaringVisning[] = (arrKaaringer ?? []).map(k => {
    const mal = Array.isArray(k.kaaringmaler) ? k.kaaringmaler[0] : k.kaaringmaler
    const arr = Array.isArray(k.arrangementer) ? k.arrangementer[0] : k.arrangementer
    return {
      id: k.id,
      aar: k.aar,
      navn: mal?.navn ?? 'Ukjent kåring',
      begrunnelse: k.begrunnelse,
      arrangementTittel: arr?.tittel ?? null,
      arrangementId: arr?.id ?? null,
    }
  })

  const kaaringer: KaaringVisning[] = [...egneListe, ...arrListe].sort((a, b) => b.aar - a.aar)

  if (!medlem || (!medlem.aktiv && !erAdmin)) notFound()

  const rolleLabel = tittelFor(medlem.rolle)
  const navn = medlem.navn ?? 'Ukjent'

  return (
    <div style={{ padding: '0 20px 20px' }}>
      {/* Breadcrumb + tittel */}
      <div style={{ padding: '12px 4px 22px', marginBottom: 8 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--text-tertiary)',
            letterSpacing: '2.5px',
            textTransform: 'uppercase',
            marginBottom: 18,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ width: 18, height: '0.5px', background: 'var(--border-strong)' }} />
          <Link
            href="/klubbinfo/medlemmer"
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            Medlemmer
          </Link>
          <span>/</span>
          <span>{navn}</span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 36,
              fontWeight: 500,
              letterSpacing: '-0.5px',
              lineHeight: 1,
              margin: 0,
              color: 'var(--text-primary)',
            }}
          >
            {navn}
          </h1>

          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {!erMegSelv && medlem?.aktiv && <SendMeldingKnapp motpartId={id} />}
            {erAdmin && (
              <Link
                href={`/klubbinfo/medlemmer/${id}/rediger`}
                style={{
                  padding: '8px 14px',
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 999,
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  fontWeight: 500,
                  textDecoration: 'none',
                }}
              >
                Rediger
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Hero */}
      <div
        style={{
          padding: 24,
          marginBottom: 24,
          textAlign: 'center',
          background:
            'radial-gradient(ellipse at top, var(--accent-soft), transparent 70%), var(--bg-elevated)',
          border: '0.5px solid var(--border-strong)',
          borderRadius: 'var(--radius)',
          backdropFilter: 'var(--blur-card)',
          WebkitBackdropFilter: 'var(--blur-card)',
        }}
      >
        <div style={{ display: 'inline-block' }}>
          <Avatar
            name={navn}
            size={78}
            src={medlem.bilde_url}
            rolle={medlem.rolle}
          />
        </div>
        {medlem.visningsnavn && medlem.visningsnavn !== medlem.navn && (
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 18,
              fontStyle: 'italic',
              color: 'var(--text-secondary)',
              marginTop: 14,
              letterSpacing: '-0.2px',
            }}
          >
            «{medlem.visningsnavn}»
          </div>
        )}
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--accent)',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            marginTop: medlem.visningsnavn && medlem.visningsnavn !== medlem.navn ? 6 : 14,
            fontWeight: 600,
          }}
        >
          {rolleLabel}
          {!medlem.aktiv && ' · Deaktivert'}
        </div>
      </div>

      {/* Kontakt */}
      <section style={{ marginBottom: 28 }}>
        <SectionLabel>Kontakt</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <FaktaRad
            label="E-post"
            href={medlem.epost ? `mailto:${medlem.epost}` : undefined}
            value={medlem.epost ?? '—'}
            mono
          />
          <FaktaRad
            label="Telefon"
            href={medlem.telefon ? `tel:${medlem.telefon}` : undefined}
            value={medlem.telefon ?? '—'}
            mono
          />
          <FaktaRad
            label="Fødselsdato"
            value={
              medlem.fodselsdato
                ? formaterDato(`${medlem.fodselsdato}T12:00:00Z`, 'd. MMMM yyyy')
                : '—'
            }
            last
          />
        </div>
      </section>

      {/* Kåringer */}
      {kaaringer.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <SectionLabel count={kaaringer.length}>Kåringer</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {kaaringer.map((k, i) => (
              <div
                key={k.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 14,
                  padding: '14px 4px',
                  borderBottom:
                    i < kaaringer.length - 1 ? '0.5px solid var(--border-subtle)' : 'none',
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
                    flexShrink: 0,
                  }}
                >
                  {k.aar}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 16,
                      fontWeight: 500,
                      color: 'var(--text-primary)',
                      letterSpacing: '-0.2px',
                      lineHeight: 1.2,
                    }}
                  >
                    {k.navn}
                  </div>
                  {k.arrangementTittel && k.arrangementId && (
                    <Link
                      href={`/arrangementer/${k.arrangementId}`}
                      style={{
                        display: 'inline-block',
                        marginTop: 3,
                        fontFamily: 'var(--font-body)',
                        fontSize: 13,
                        color: 'var(--accent)',
                        letterSpacing: '-0.1px',
                        textDecoration: 'none',
                      }}
                    >
                      {k.arrangementTittel}
                    </Link>
                  )}
                  {k.begrunnelse && (
                    <div
                      style={{
                        marginTop: 4,
                        fontFamily: 'var(--font-body)',
                        fontSize: 12,
                        fontStyle: 'italic',
                        color: 'var(--text-tertiary)',
                        lineHeight: 1.45,
                      }}
                    >
                      «{k.begrunnelse}»
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Arrangementer opprettet av medlemmet */}
      {arrangementer && arrangementer.length > 0 && (
        <section style={{ marginBottom: 12 }}>
          <SectionLabel count={arrangementer.length}>Opprettet</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {arrangementer.map((a, i) => (
              <Link
                key={a.id}
                href={`/arrangementer/${a.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 14,
                  padding: '14px 4px',
                  borderBottom:
                    i < arrangementer.length - 1 ? '0.5px solid var(--border-subtle)' : 'none',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 16,
                    fontWeight: 500,
                    color: 'var(--text-primary)',
                    letterSpacing: '-0.2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {a.tittel}
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: 'var(--text-tertiary)',
                    letterSpacing: '1.4px',
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {formaterDato(a.start_tidspunkt, 'MMM yyyy')}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function FaktaRad({
  label,
  value,
  href,
  mono,
  last,
}: {
  label: string
  value: string
  href?: string
  mono?: boolean
  last?: boolean
}) {
  const innhold = (
    <>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9.5,
          color: 'var(--text-tertiary)',
          letterSpacing: '1.6px',
          textTransform: 'uppercase',
          marginBottom: 3,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)',
          fontSize: 14,
          color: 'var(--text-primary)',
          letterSpacing: mono ? '0.2px' : '0.1px',
        }}
      >
        {value}
      </div>
    </>
  )

  const stil: React.CSSProperties = {
    padding: '14px 4px',
    borderBottom: last ? 'none' : '0.5px solid var(--border-subtle)',
    display: 'block',
    textDecoration: 'none',
    color: 'inherit',
  }

  if (href) return <a href={href} style={stil}>{innhold}</a>
  return <div style={stil}>{innhold}</div>
}
