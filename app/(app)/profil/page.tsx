import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { getInnloggetBruker } from '@/lib/auth-cache'
import { norskAar } from '@/lib/dato'
import Avatar from '@/components/ui/Avatar'
import Icon from '@/components/ui/Icon'
import SectionLabel from '@/components/ui/SectionLabel'
import VarslerInnstillinger from '@/components/VarslerInnstillinger'
import VarslerListe from '@/components/profil/VarslerListe'
import PassInfoKort from '@/components/profil/PassInfoKort'
import { tittelFor } from '@/lib/roller'
import LoggUtKnapp from './LoggUtKnapp'

const KLUBBEN_START_AAR = 2007

export default async function Profil() {
  const [supabase, user] = await Promise.all([createServerClient(), getInnloggetBruker()])

  const [
    { data: profil },
    { count: oppmoeter },
    { count: kaaringer },
    { data: ansvar },
    { data: varselPref },
    { data: varsler },
    { count: antallUlesteVarsler },
    { data: passInfo },
    { count: ulestPrivat },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('navn, visningsnavn, rolle, bilde_url')
      .eq('id', user!.id)
      .single(),
    supabase
      .from('paameldinger')
      .select('arrangement_id', { count: 'exact', head: true })
      .eq('profil_id', user!.id)
      .eq('status', 'ja'),
    supabase
      .from('kaaring_vinnere')
      .select('id', { count: 'exact', head: true })
      .eq('profil_id', user!.id),
    supabase
      .from('arrangoransvar')
      .select('id, aar, arrangement_navn, arrangement_id, arrangementer (id, tittel, start_tidspunkt, oppmoetested)')
      .eq('ansvarlig_id', user!.id)
      .gte('aar', norskAar())
      .order('aar'),
    supabase
      .from('varsel_preferanser')
      .select('push_aktiv, epost_aktiv')
      .eq('profil_id', user!.id)
      .maybeSingle(),
    supabase
      .from('varsel_logg')
      .select('id, tittel, melding, lest, opprettet, url')
      .eq('profil_id', user!.id)
      .order('opprettet', { ascending: false })
      .limit(10),
    // Total ulest-count på tvers av hele historikken — listen viser kun
    // top 10, men "Marker alle som lest"-knappen og tellingen i tittelen
    // må kjenne til alle uleste, også de eldre enn topp 10. Se #207.
    supabase
      .from('varsel_logg')
      .select('id', { count: 'exact', head: true })
      .eq('profil_id', user!.id)
      .eq('lest', false),
    // RLS sørger for at vi kun får egen rad. maybeSingle siden raden
    // ikke nødvendigvis finnes ennå.
    supabase
      .from('pass_info')
      .select('nummer, utloper')
      .eq('profil_id', user!.id)
      .maybeSingle(),
    // Antall uleste privatmeldinger til meg. RLS sørger for at vi kun
    // teller meldinger i samtaler vi deltar i; profil_id != meg ekskluderer
    // egne sendte meldinger. Flyttes hit fra /chat (#256).
    supabase
      .from('samtale_chat')
      .select('id', { count: 'exact', head: true })
      .eq('lest', false)
      .neq('profil_id', user!.id),
  ])

  const navn = profil?.navn ?? 'Ukjent'
  const rolle = tittelFor(profil?.rolle)
  const ulest = ulestPrivat ?? 0

  return (
    <div style={{ padding: '0 20px 20px' }}>
      {/* Header */}
      <header
        style={{
          marginTop: 12,
          marginBottom: 26,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
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
            Medlem siden {KLUBBEN_START_AAR}
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
            Din profil
          </h1>
        </div>

        <Link
          href="/profil/rediger"
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
            flexShrink: 0,
          }}
        >
          Rediger
        </Link>
      </header>

      {/* Profil-hero */}
      <div
        style={{
          padding: 24,
          marginBottom: 20,
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
            src={profil?.bilde_url ?? null}
            rolle={profil?.rolle}
          />
        </div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 22,
            fontWeight: 500,
            color: 'var(--text-primary)',
            marginTop: 14,
            letterSpacing: '-0.3px',
          }}
        >
          {navn}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--accent)',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            marginTop: 4,
            fontWeight: 600,
          }}
        >
          {rolle}
        </div>

        {/* Stats */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 28,
            marginTop: 20,
            paddingTop: 20,
            borderTop: '0.5px solid var(--border-subtle)',
          }}
        >
          {[
            { val: oppmoeter ?? 0, lbl: 'Oppmøter' },
            { val: kaaringer ?? 0, lbl: 'Kåringer' },
          ].map(s => (
            <div key={s.lbl}>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 24,
                  fontWeight: 500,
                  color: 'var(--accent)',
                }}
              >
                {s.val}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  color: 'var(--text-tertiary)',
                  letterSpacing: '1.5px',
                  textTransform: 'uppercase',
                  marginTop: 2,
                  fontWeight: 600,
                }}
              >
                {s.lbl}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Privatmeldinger — flyttes hit fra /chat (#256) slik at lenken
          er tilgjengelig fra profil-siden, ikke fra klubb-chat. */}
      <Link
        href="/samtaler"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 14px',
          marginBottom: 22,
          background: 'var(--bg-elevated)',
          border: '0.5px solid var(--border)',
          borderRadius: 'var(--radius-card)',
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <Icon name="message" size={18} color="var(--accent)" strokeWidth={1.6} />
        <span
          style={{
            flex: 1,
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            color: 'var(--text-primary)',
          }}
        >
          Privatmeldinger
        </span>
        {ulest > 0 && (
          <span
            style={{
              minWidth: 20,
              height: 20,
              padding: '0 7px',
              borderRadius: 999,
              background: 'var(--accent)',
              color: '#0a0a0a',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {ulest}
          </span>
        )}
        <Icon name="chevron" size={14} color="var(--text-tertiary)" />
      </Link>

      {/* Arrangøransvar */}
      {ansvar && ansvar.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <SectionLabel>Arrangøransvar</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {ansvar.map((a, i) => {
              const lagtInn = !!a.arrangement_id
              const arr = Array.isArray(a.arrangementer)
                ? a.arrangementer[0]
                : a.arrangementer
              const meta = arr
                ? arr.oppmoetested ?? '—'
                : 'Dato og sted ikke satt'
              const farge = lagtInn ? 'var(--success)' : 'var(--danger)'
              return (
                <Link
                  key={a.id}
                  href={arr ? `/arrangementer/${arr.id}` : '/arrangoransvar'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '16px 4px',
                    borderBottom:
                      i < ansvar.length - 1 ? '0.5px solid var(--border-subtle)' : 'none',
                    textDecoration: 'none',
                    color: 'inherit',
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: farge,
                      flexShrink: 0,
                      boxShadow: `0 0 0 3px color-mix(in srgb, ${farge} 18%, transparent)`,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        color: 'var(--text-tertiary)',
                        letterSpacing: '1.6px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        marginBottom: 4,
                      }}
                    >
                      {a.aar}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 18,
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        letterSpacing: '-0.2px',
                        lineHeight: 1.15,
                        marginBottom: 3,
                      }}
                    >
                      {a.arrangement_navn}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 12,
                        color: 'var(--text-tertiary)',
                        letterSpacing: '0.1px',
                      }}
                    >
                      {meta}
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: farge,
                      letterSpacing: '1.4px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}
                  >
                    {lagtInn ? 'Lagt inn' : 'Ikke lagt inn'}
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Varsler-innstillinger */}
      <VarslerInnstillinger
        pushAktiv={varselPref?.push_aktiv ?? false}
        epostAktiv={varselPref?.epost_aktiv ?? true}
      />

      {/* Personlige varsler — interaktiv klient-komponent med filter, kollaps
          og marker-alle-lest. Vis seksjonen hvis det enten finnes varsler i
          top 10 ELLER hvis det finnes uleste eldre enn top 10 (se #207). */}
      {((varsler && varsler.length > 0) || (antallUlesteVarsler ?? 0) > 0) && (
        <VarslerListe
          varsler={varsler ?? []}
          antallUlesteTotal={antallUlesteVarsler ?? 0}
        />
      )}

      {/* Pass og Innspill samlet nederst — sjeldent brukt, eller mest praktisk
          å nå når man scroller forbi det viktige (varsler, ansvar). */}

      {/* Pass-info — synlig kun for eier (RLS) */}
      <section style={{ marginTop: 32, marginBottom: 24 }}>
        <SectionLabel>Pass</SectionLabel>
        <PassInfoKort
          nummer={passInfo?.nummer ?? null}
          utloper={passInfo?.utloper ?? null}
        />
      </section>

      {/* Innspill */}
      <section style={{ marginBottom: 24 }}>
        <SectionLabel>Innspill</SectionLabel>
        <Link
          href="/innspill"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '16px 4px',
            textDecoration: 'none',
            color: 'inherit',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 500,
                color: 'var(--text-primary)',
                letterSpacing: '-0.2px',
                lineHeight: 1.15,
                marginBottom: 3,
              }}
            >
              Dine innspill
            </div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                color: 'var(--text-tertiary)',
                letterSpacing: '0.1px',
              }}
            >
              Se innspill du har sendt inn og svar på håndterte saker
            </div>
          </div>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              color: 'var(--text-tertiary)',
              fontWeight: 400,
            }}
          >
            →
          </span>
        </Link>
      </section>

      {/* Logg ut */}
      <div style={{ marginTop: 28 }}>
        <LoggUtKnapp />
      </div>
    </div>
  )
}
