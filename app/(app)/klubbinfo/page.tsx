import Link from 'next/link'
import { MapPinIcon } from '@heroicons/react/24/outline'
import { createServerClient } from '@/lib/supabase/server'
import { getProfil } from '@/lib/auth-cache'
import { norskAar } from '@/lib/dato'
import Icon, { IkonNavn } from '@/components/ui/Icon'
import { kanAdministrere } from '@/lib/roller'
import versjon from '@/lib/versjon.json'
import { KLUBB_STIFTET, KLUBB_STED, KLUBB_NAVN_LINJE_1, KLUBB_NAVN_LINJE_2 } from '@/lib/klubb-config'
import { format } from 'date-fns'
import { nb } from 'date-fns/locale'

// Hentes fra KLUBB_STIFTET i stedet for hardkodet konstant
const KLUBBEN_START_AAR = KLUBB_STIFTET.aar

// Hele stiftelsesdatoen formatert på norsk («24. november 2007»).
// Lokal fast dato uten tidssone-aspekt — new Date(y, m-1, d) er trygt her.
const STIFTET_TEKST = format(
  new Date(KLUBB_STIFTET.aar, KLUBB_STIFTET.maaned - 1, KLUBB_STIFTET.dag),
  'd. MMMM yyyy',
  { locale: nb }
)

export default async function Klubbinfo() {
  const [supabase, profil] = await Promise.all([createServerClient(), getProfil()])
  const erAdmin = kanAdministrere(profil?.rolle)

  const { count: antallMedlemmer } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('aktiv', true)

  const antallAar = norskAar() - KLUBBEN_START_AAR + 1

  type Rad = {
    icon: IkonNavn
    title: string
    sub: string
    meta?: string
    href: string
    kunAdmin?: boolean
  }

  const rader: Rad[] = [
    {
      icon: 'users',
      title: 'Medlemmer',
      sub: `${antallMedlemmer ?? 0} aktive`,
      href: '/klubbinfo/medlemmer',
    },
    {
      icon: 'list',
      title: 'Arrangøransvar',
      sub: `Hvem tar hva i ${norskAar()}`,
      href: '/arrangoransvar',
    },
    {
      icon: 'trophy',
      title: 'Kåringer',
      sub: 'Årets hederspriser',
      href: '/kaaringer',
    },
    {
      icon: 'doc',
      title: 'Vedtekter',
      sub: 'Regler og kvotering',
      href: '/klubbinfo/vedtekter/vedtekter',
    },
    {
      icon: 'chart',
      title: 'Statistikk',
      sub: 'Deltakelse og rekorder',
      href: '/klubbinfo/statistikk',
    },
    {
      icon: 'cog',
      title: 'Innstillinger',
      sub: 'Varsler og admin',
      href: '/innstillinger',
      kunAdmin: true,
    },
    {
      icon: 'info',
      title: 'Om appen',
      sub: 'Sikkerhet, personvern og hvordan dette er bygget',
      href: '/om-appen',
    },
  ]

  const synligeRader = rader.filter(r => !r.kunAdmin || erAdmin)

  return (
    <div style={{ padding: '0 20px 20px' }}>
      {/* Editorial hero */}
      <div
        style={{
          position: 'relative',
          padding: '12px 4px 32px',
          marginBottom: 32,
          borderBottom: '0.5px solid var(--border-subtle)',
          textAlign: 'left',
        }}
      >
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
          Stiftet {STIFTET_TEKST}
          <span aria-hidden="true" style={{ opacity: 0.4 }}>·</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <MapPinIcon aria-hidden="true" style={{ width: 11, height: 11 }} />
            {KLUBB_STED}
          </span>
        </div>

        {/* Diskret divider med versjonsnummer høyrejustert. Plassert her etter
            at headeren ble strippet for versjon i #190 — klubb-siden er nå
            kanonisk sted for app-versjon. */}
        <div
          style={{
            borderTop: '0.5px solid var(--border-subtle)',
            margin: '0 0 16px',
            paddingTop: 6,
            display: 'flex',
            justifyContent: 'flex-end',
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.5px',
          }}
        >
          {versjon.versjon}
        </div>

        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 44,
            fontWeight: 400,
            color: 'var(--text-primary)',
            letterSpacing: '-1.2px',
            lineHeight: 0.95,
            margin: 0,
            fontStyle: 'italic',
          }}
        >
          {KLUBB_NAVN_LINJE_1}
        </h2>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 44,
            fontWeight: 400,
            color: 'var(--text-secondary)',
            letterSpacing: '-1.2px',
            lineHeight: 0.95,
            margin: '2px 0 0',
          }}
        >
          {KLUBB_NAVN_LINJE_2}
        </h2>

        {/* Nøkkeltall */}
        <div
          style={{
            display: 'flex',
            gap: 22,
            marginTop: 22,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
          }}
        >
          {[
            { val: antallMedlemmer ?? 0, lbl: 'Medlemmer' },
            { val: antallAar, lbl: 'Årganger' },
          ].map(s => (
            <div key={s.lbl}>
              <div
                style={{
                  color: 'var(--accent)',
                  fontSize: 18,
                  fontFamily: 'var(--font-display)',
                  letterSpacing: '-0.3px',
                  marginBottom: 2,
                }}
              >
                {s.val}
              </div>
              {s.lbl}
            </div>
          ))}
        </div>
      </div>

      {/* Om klubben */}
      <div style={{ marginBottom: 32 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--text-tertiary)',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            marginBottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontWeight: 600,
          }}
        >
          Om klubben
          <span style={{ flex: 1, height: '0.5px', background: 'var(--border-subtle)' }} />
        </div>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            color: 'var(--text-secondary)',
            lineHeight: 1.55,
            margin: '0 0 10px',
          }}
        >
          Vi blir gamle og grå, så en syklubb må vi få.
        </p>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            color: 'var(--text-secondary)',
            lineHeight: 1.55,
            margin: '0 0 10px',
          }}
        >
          Her skal verdensproblemer løses og diskuteres av de største besserwisserne fra Mortensrud.
        </p>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 15,
            color: 'var(--text-secondary)',
            lineHeight: 1.55,
            margin: 0,
          }}
        >
          Så vel møtt finansakrobater og rikssynsere til månedlige sammenkomster.
        </p>
      </div>

      {/* Seksjons-label */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text-tertiary)',
          letterSpacing: '2px',
          textTransform: 'uppercase',
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontWeight: 600,
        }}
      >
        Innhold
        <span style={{ flex: 1, height: '0.5px', background: 'var(--border-subtle)' }} />
      </div>

      {/* Magazine-TOC */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {synligeRader.map(r => (
          <Link
            key={r.title}
            href={r.href}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '18px 4px',
              borderBottom: '0.5px solid var(--border-subtle)',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <div
              style={{
                width: 22,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
              }}
            >
              <Icon name={r.icon} size={18} color="var(--text-secondary)" strokeWidth={1.4} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 19,
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.3px',
                  lineHeight: 1.1,
                  marginBottom: 2,
                }}
              >
                {r.title}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  color: 'var(--text-tertiary)',
                  letterSpacing: '0.1px',
                }}
              >
                {r.sub}
              </div>
            </div>
            {r.meta && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  marginRight: 4,
                  letterSpacing: '0.5px',
                }}
              >
                {r.meta}
              </span>
            )}
            <Icon name="chevron" size={14} color="var(--text-tertiary)" />
          </Link>
        ))}
      </div>
    </div>
  )
}
