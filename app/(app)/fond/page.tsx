import { notFound } from 'next/navigation'
import Link from 'next/link'
import SectionLabel from '@/components/ui/SectionLabel'
import Card from '@/components/ui/Card'
import Avatar from '@/components/ui/Avatar'
import { createServerClient } from '@/lib/supabase/server'
import { getProfil } from '@/lib/auth-cache'
import { kanAdministrere } from '@/lib/roller'
import { formaterDato } from '@/lib/dato'
import { KLUBB_KORTNAVN } from '@/lib/klubb-config'

// ─── Formateringshjelpere (beholdes fra godkjent mockup) ─────────────────────

const kr = (n: number) => `${n.toLocaleString('nb')} kr`

const prosent = (n: number) =>
  `${n > 0 ? '+' : ''}${n.toLocaleString('nb', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`

const signKr = (n: number) =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('nb')} kr`

const retningFarge = (n: number) =>
  n > 0 ? 'var(--success)' : n < 0 ? 'var(--danger)' : 'var(--text-secondary)'

// Avkastningslinje i Nordnet-stil: fortegn, kroner og prosent, farget grønn/rød
function Avkastning({ kroner, pst, size = 12 }: { kroner: number; pst: number; size?: number }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: size,
        fontWeight: 600,
        color: retningFarge(kroner),
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      }}
    >
      {signKr(kroner)} ({prosent(pst)})
    </span>
  )
}

// ─── Side (async RSC) ─────────────────────────────────────────────────────────

export default async function FondSide() {
  const profil = await getProfil()
  // Testfase-gating: fanen er kun synlig for admin (#443).
  // Når Reidar har godkjent i prod fjernes dette og alle aktive medlemmer får tilgang.
  if (!kanAdministrere(profil?.rolle)) return notFound()

  const supabase = await createServerClient()

  // Hent alle fond-data parallelt
  const [
    { data: eiendommer },
    { data: verdipapirer },
    { data: innskudd },
    { data: kontant },
  ] = await Promise.all([
    supabase.from('fond_eiendom').select('*').order('navn'),
    supabase.from('fond_verdipapir').select('*').order('navn'),
    supabase
      .from('fond_innskudd')
      .select('*, profiles(navn, bilde_url, rolle)')
      .order('dato', { ascending: false }),
    supabase.from('fond_kontant').select('saldo, oppdatert').eq('id', 1).maybeSingle(),
  ])

  // Aggregater — tåler 0-verdier og tomme lister
  const eiendomListe = eiendommer ?? []
  const vpListe = verdipapirer ?? []
  const innskuddListe = innskudd ?? []
  const kontantSaldo = kontant?.saldo ?? 0

  const eiendomSum = eiendomListe.reduce((s, e) => s + e.markedsverdi, 0)
  const vpVerdi = vpListe.reduce((s, v) => s + v.verdi, 0)
  const vpInngang = vpListe.reduce((s, v) => s + v.anskaffelsesverdi, 0)
  const vpAvkastning = vpVerdi - vpInngang
  const totalverdi = eiendomSum + vpVerdi + kontantSaldo

  // «Per <dato>» — seneste oppdatert-tidsstempel på tvers av kildene
  const tidsstempler = [
    ...eiendomListe.map(e => e.oppdatert),
    ...vpListe.map(v => v.oppdatert),
    ...(kontant?.oppdatert ? [kontant.oppdatert] : []),
  ]
  const sistOppdatert = tidsstempler.length > 0
    ? tidsstempler.reduce((a, b) => (a > b ? a : b))
    : null
  const perDato = sistOppdatert
    ? formaterDato(sistOppdatert, "d. MMMM yyyy")
    : null

  return (
    <div style={{ padding: '0 20px 32px' }}>
      {/* Editorial hero — matcher klubbinfo-stilen */}
      <div
        style={{
          padding: '12px 4px 26px',
          marginBottom: 28,
          borderBottom: '0.5px solid var(--border-subtle)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--text-tertiary)',
            letterSpacing: '2.5px',
            textTransform: 'uppercase',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ width: 18, height: '0.5px', background: 'var(--border-strong)' }} />
          {/* Genitiv-s på kortnavnet — etiketten følger klubb-instansens navn */}
          {KLUBB_KORTNAVN}s fond
        </div>

        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            marginBottom: 4,
          }}
        >
          Totalverdi
          {perDato && (
            <>
              <span aria-hidden="true" style={{ opacity: 0.4 }}> · </span>
              Per {perDato}
            </>
          )}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 44,
            fontWeight: 400,
            color: 'var(--text-primary)',
            letterSpacing: '-1.2px',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {kr(totalverdi)}
        </div>

        {/* Nøkkeltall per aktivaklasse */}
        <div
          style={{
            display: 'flex',
            gap: 22,
            marginTop: 20,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
          }}
        >
          {[
            { val: eiendomSum, lbl: 'Eiendom' },
            { val: vpVerdi, lbl: 'Verdipapirer' },
            { val: kontantSaldo, lbl: 'Kontanter' },
          ].map(s => (
            <div key={s.lbl}>
              <div
                style={{
                  color: 'var(--accent)',
                  fontSize: 15,
                  fontFamily: 'var(--font-display)',
                  letterSpacing: '-0.3px',
                  marginBottom: 2,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {s.val.toLocaleString('nb')}
              </div>
              {s.lbl}
            </div>
          ))}
        </div>

        {/* Diskret lenke til admin-redigering */}
        <div style={{ marginTop: 16 }}>
          <Link
            href="/fond/rediger"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--text-tertiary)',
              textDecoration: 'none',
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              opacity: 0.7,
            }}
          >
            Rediger →
          </Link>
        </div>
      </div>

      {/* Eiendommer */}
      <section style={{ marginBottom: 28 }}>
        <SectionLabel count={eiendomListe.length}>Eiendommer</SectionLabel>
        <Card padding={false}>
          {eiendomListe.length === 0 ? (
            <div
              style={{
                padding: '20px 16px',
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                color: 'var(--text-tertiary)',
              }}
            >
              Ingen eiendommer
            </div>
          ) : (
            <>
              {eiendomListe.map((e, i) => (
                <div
                  key={e.id}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 12,
                    padding: '14px 16px',
                    borderBottom: i < eiendomListe.length - 1 ? '0.5px solid var(--border-subtle)' : 'none',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 15,
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        marginBottom: 2,
                      }}
                    >
                      {e.navn}
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-tertiary)' }}>
                      Anskaffelsesverdi {kr(e.anskaffelsesverdi)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 15,
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        fontVariantNumeric: 'tabular-nums',
                        marginBottom: 2,
                      }}
                    >
                      {kr(e.markedsverdi)}
                    </div>
                    <Avkastning
                      kroner={e.markedsverdi - e.anskaffelsesverdi}
                      pst={e.anskaffelsesverdi > 0
                        ? ((e.markedsverdi - e.anskaffelsesverdi) / e.anskaffelsesverdi) * 100
                        : 0}
                    />
                  </div>
                </div>
              ))}
              {/* Sum-rad — kun når rader finnes */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  padding: '12px 16px',
                  borderTop: '0.5px solid var(--border-strong)',
                  background: 'var(--bg-elevated-2)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: '1.5px',
                    textTransform: 'uppercase',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  Markedsverdi
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 15,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {kr(eiendomSum)}
                </span>
              </div>
            </>
          )}
        </Card>
      </section>

      {/* Aksjer og fond */}
      <section style={{ marginBottom: 28 }}>
        <SectionLabel count={vpListe.length}>Aksjer og fond</SectionLabel>
        <Card padding={false}>
          {vpListe.length === 0 ? (
            <div
              style={{
                padding: '20px 16px',
                fontFamily: 'var(--font-body)',
                fontSize: 14,
                color: 'var(--text-tertiary)',
              }}
            >
              Ingen aksjer eller fond
            </div>
          ) : (
            <>
              {vpListe.map((v, i) => {
                const avk = v.verdi - v.anskaffelsesverdi
                return (
                  <div
                    key={v.id}
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '14px 16px',
                      borderBottom: i < vpListe.length - 1 ? '0.5px solid var(--border-subtle)' : 'none',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: 15,
                          fontWeight: 500,
                          color: 'var(--text-primary)',
                          marginBottom: 2,
                        }}
                      >
                        {v.navn}
                      </div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-tertiary)' }}>
                        Anskaffelsesverdi {kr(v.anskaffelsesverdi)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontSize: 15,
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          fontVariantNumeric: 'tabular-nums',
                          marginBottom: 2,
                        }}
                      >
                        {kr(v.verdi)}
                      </div>
                      <Avkastning
                        kroner={avk}
                        pst={v.anskaffelsesverdi > 0 ? (avk / v.anskaffelsesverdi) * 100 : 0}
                      />
                    </div>
                  </div>
                )
              })}
              {/* Sum-rad med samlet avkastning — kun når rader finnes */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  padding: '12px 16px',
                  borderTop: '0.5px solid var(--border-strong)',
                  background: 'var(--bg-elevated-2)',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    letterSpacing: '1.5px',
                    textTransform: 'uppercase',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  Totalt
                </span>
                <span style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  <Avkastning
                    kroner={vpAvkastning}
                    pst={vpInngang > 0 ? (vpAvkastning / vpInngang) * 100 : 0}
                    size={13}
                  />
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 15,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {kr(vpVerdi)}
                  </span>
                </span>
              </div>
            </>
          )}
        </Card>
      </section>

      {/* Kontantbeholdning */}
      <section>
        <SectionLabel>Kontantbeholdning</SectionLabel>
        <Card padding={false}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              padding: '14px 16px',
              borderBottom: innskuddListe.length > 0 ? '0.5px solid var(--border-subtle)' : 'none',
            }}
          >
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>
              På konto
            </span>
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--text-primary)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {kr(kontantSaldo)}
            </span>
          </div>

          {/* Innskyter-blokk — kun synlig når innskudd finnes */}
          {innskuddListe.length > 0 && (
            <>
              <div
                style={{
                  padding: '10px 16px 4px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  letterSpacing: '1.5px',
                  textTransform: 'uppercase',
                  color: 'var(--text-tertiary)',
                }}
              >
                Tilhører innskytere
              </div>
              {innskuddListe.map((inn, i) => {
                // Supabase join returnerer profiles som objekt (eller null)
                const p = inn.profiles as { navn: string; bilde_url: string | null; rolle: string | null } | null
                const navn = p?.navn ?? 'Ukjent'
                const fornavn = navn.split(' ')[0]
                return (
                  <div
                    key={inn.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 16px',
                      borderBottom: i < innskuddListe.length - 1 ? '0.5px solid var(--border-subtle)' : 'none',
                    }}
                  >
                    <Avatar name={navn} size={28} src={p?.bilde_url ?? null} rolle={p?.rolle ?? null} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-primary)' }}>
                        {fornavn}
                      </div>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-tertiary)' }}>
                        Innskudd {formaterDato(inn.dato, 'd. MMM yyyy')}
                      </div>
                    </div>
                    <span
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 14,
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {kr(inn.belop)}
                    </span>
                  </div>
                )
              })}
            </>
          )}
        </Card>
      </section>
    </div>
  )
}
