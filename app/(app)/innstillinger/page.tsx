import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfil } from '@/lib/auth-cache'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import VarselToggle from '@/components/VarselToggle'
import IssuesListe, { hentAapneIssues } from './IssuesListe'
import VarselLogg from './VarselLogg'
import ArrangementmalerAdmin from '@/components/ArrangementmalerAdmin'
import KaaringMalAdmin from '@/components/KaaringMalAdmin'
import InnstillingsKort from '@/components/innstillinger/InnstillingsKort'
import { kanAdministrere } from '@/lib/roller'

const innstillingLabels: Record<string, string> = {
  // Arrangementer
  nytt_arrangement: 'Nytt arrangement opprettet',
  oppdatert: '«Varsle nå»-knapp på arrangement',
  paaminnelse_7d: 'Påminnelse 7 dager før',
  paaminnelse_1d: 'Påminnelse dagen før',
  purring_aktiv: 'Purring til de som ikke har svart (3 d før)',
  arrangor_purring: 'Auto-purring til arrangøransvarlige',
  purring_ansvar: 'Manuell purring fra «purr»-knapp',
  // Poll og innlegg
  ny_poll: 'Ny avstemming',
  'melding-ny': 'Nytt innlegg på agenda',
  // Chat
  mention: '@-mention i chat',
  'privat-melding': 'Ny privatmelding',
  // Pass
  'pass-forespørsel': 'Forespørsel om pass-info (til generalsekretær)',
  'pass-godkjent': 'Pass-tilgang godkjent (til søker)',
  'pass-avslatt': 'Pass-tilgang avslått (til søker)',
  // Innspill
  ønske_ny: 'Nytt innspill (til admin)',
  ønske_lukket: 'Ditt innspill er håndtert',
  // Drift
  test_modus: 'Testmodus — varsler kun til test-eposten',
}

// Foretrukket rekkefølge for visning. Noekler som ikke er i lista
// havner sist (alfabetisk).
const VARSEL_REKKEFOLGE = [
  'nytt_arrangement',
  'oppdatert',
  'paaminnelse_7d',
  'paaminnelse_1d',
  'purring_aktiv',
  'arrangor_purring',
  'purring_ansvar',
  'ny_poll',
  'melding-ny',
  'mention',
  'privat-melding',
  'pass-forespørsel',
  'pass-godkjent',
  'pass-avslatt',
  'ønske_ny',
  'ønske_lukket',
  'test_modus',
]

export default async function Innstillinger() {
  const [supabase, profil] = await Promise.all([createServerClient(), getProfil()])

  if (!kanAdministrere(profil?.rolle)) notFound()

  const admin = createAdminClient()
  const sisteDognIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const sjuDagerIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const [
    { data: logg, count: varselTotal },
    { count: pushCount },
    { data: innstillinger },
    { count: passVentende },
    { count: varselSisteDogn },
    { data: vitalsRader },
  ] = await Promise.all([
    admin
      .from('varsel_logg')
      .select('id, tittel, type, kanal, opprettet, profil_id, profiles (visningsnavn)', { count: 'exact' })
      .order('opprettet', { ascending: false })
      .limit(10),
    admin.from('push_subscriptions').select('id', { count: 'exact', head: true }),
    supabase
      .from('varsel_innstillinger')
      .select('noekkel, aktiv, beskrivelse')
      .order('noekkel'),
    admin
      .from('pass_tilgang_forespørsel')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'venter'),
    admin
      .from('varsel_logg')
      .select('id', { count: 'exact', head: true })
      .gte('opprettet', sisteDognIso),
    admin
      .from('vitals_logg')
      .select('metric, verdi, device_type')
      .gte('opprettet', sjuDagerIso)
      .eq('device_type', 'mobile')
      .limit(5000),
  ])

  // Aggreger vitals — p75 per metric for mobil siste 7 dager
  type VitalsRow = { metric: string; verdi: number }
  const verdierPerMetric = new Map<string, number[]>()
  for (const r of (vitalsRader ?? []) as VitalsRow[]) {
    const liste = verdierPerMetric.get(r.metric) ?? []
    liste.push(r.verdi)
    verdierPerMetric.set(r.metric, liste)
  }
  const VITALS_TERSKEL: Record<string, { god: number; ok: number; enhet: string }> = {
    LCP: { god: 2500, ok: 4000, enhet: 'ms' },
    INP: { god: 200, ok: 500, enhet: 'ms' },
    CLS: { god: 0.1, ok: 0.25, enhet: '' },
    FCP: { god: 1800, ok: 3000, enhet: 'ms' },
    TTFB: { god: 800, ok: 1800, enhet: 'ms' },
  }
  const vitalsSammendrag = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB']
    .map(metric => {
      const v = verdierPerMetric.get(metric) ?? []
      if (v.length === 0) return null
      const sortert = [...v].sort((a, b) => a - b)
      const p75 = sortert[Math.floor((sortert.length - 1) * 0.75)]
      const t = VITALS_TERSKEL[metric]
      const fargenavn: 'god' | 'ok' | 'darlig' =
        p75 <= t.god ? 'god' : p75 <= t.ok ? 'ok' : 'darlig'
      const verdi = metric === 'CLS' ? p75.toFixed(3) : `${Math.round(p75)} ${t.enhet}`
      return { metric, verdi, fargenavn, n: v.length }
    })
    .filter(Boolean) as { metric: string; verdi: string; fargenavn: 'god' | 'ok' | 'darlig'; n: number }[]

  const [{ data: maler }, { data: kaaringmaler }, aapneIssues] = await Promise.all([
    admin.from('arrangementmaler').select('*').order('rekkefølge'),
    admin.from('kaaringmaler').select('id, navn, rekkefolge').order('rekkefolge'),
    hentAapneIssues(),
  ])

  return (
    <div style={{ padding: '0 20px 20px' }}>
      {/* Header */}
      <div
        style={{
          padding: '8px 4px 20px',
          marginBottom: 20,
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
            marginBottom: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontWeight: 600,
          }}
        >
          <span style={{ width: 18, height: '0.5px', background: 'var(--border-strong)' }} />
          <Link
            href="/klubbinfo"
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            Klubbinfo
          </Link>
          <span>/</span>
          <span>Innstillinger</span>
        </div>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 34,
            fontWeight: 400,
            color: 'var(--text-primary)',
            letterSpacing: '-0.8px',
            lineHeight: 0.98,
            margin: 0,
          }}
        >
          Innstillinger
        </h2>
      </div>

      {/* Admin-skille */}
      <div
        style={{
          marginBottom: 22,
          padding: '12px 14px',
          borderRadius: 12,
          border: '0.5px solid var(--border-strong)',
          background: 'var(--accent-soft)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: '50%',
            background: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#0a0a0a"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z" />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--text-tertiary)',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              fontWeight: 600,
              marginBottom: 1,
            }}
          >
            Kun for admin
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 17,
              fontWeight: 500,
              color: 'var(--text-primary)',
              letterSpacing: '-0.2px',
              lineHeight: 1,
            }}
          >
            Administrasjon
          </div>
        </div>
      </div>

      {/* Push-varsler */}
      <InnstillingsKort
        tittel="Push-varsler"
        oppsummering={`${pushCount ?? 0} enhet${(pushCount ?? 0) !== 1 ? 'er' : ''} registrert`}
      >
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          Antall enheter som har skrudd på push-varsler. Hvert medlem kan ha
          push på flere enheter — telleren reflekterer summen av alle.
        </p>
      </InnstillingsKort>

      {/* Varsler-kontrollpanel */}
      {(() => {
        const sortert = [...(innstillinger ?? [])].sort((a, b) => {
          const ia = VARSEL_REKKEFOLGE.indexOf(a.noekkel)
          const ib = VARSEL_REKKEFOLGE.indexOf(b.noekkel)
          if (ia === -1 && ib === -1) return a.noekkel.localeCompare(b.noekkel)
          if (ia === -1) return 1
          if (ib === -1) return -1
          return ia - ib
        })
        const aktiveCount = sortert.filter(s => s.aktiv).length
        return (
          <InnstillingsKort
            tittel="Varsler — kontrollpanel"
            oppsummering={`${aktiveCount} av ${sortert.length} typer aktive`}
            beskrivelse="Hver type kan skrus av sentralt — påvirker alle medlemmer. Brukerens egne push/epost-innstillinger gjelder i tillegg."
          >
            <div>
              {sortert.map((inn, i, arr) => (
                <VarselToggle
                  key={inn.noekkel}
                  noekkel={inn.noekkel}
                  aktiv={inn.aktiv}
                  beskrivelse={innstillingLabels[inn.noekkel] ?? inn.beskrivelse ?? inn.noekkel}
                  last={i === arr.length - 1}
                />
              ))}
            </div>
          </InnstillingsKort>
        )
      })()}

      {/* Faste arrangementer */}
      <InnstillingsKort
        tittel="Faste arrangementer"
        oppsummering={`${maler?.length ?? 0} ${(maler?.length ?? 0) === 1 ? 'mal' : 'maler'}`}
      >
        <ArrangementmalerAdmin maler={maler ?? []} />
      </InnstillingsKort>

      {/* Kåringer */}
      <InnstillingsKort
        tittel="Kåringer"
        oppsummering={`${kaaringmaler?.length ?? 0} ${(kaaringmaler?.length ?? 0) === 1 ? 'mal' : 'maler'}`}
      >
        <KaaringMalAdmin maler={kaaringmaler ?? []} />
      </InnstillingsKort>

      {/* Pass-godkjenninger */}
      <InnstillingsKort
        tittel="Pass-godkjenninger"
        oppsummering={
          (passVentende ?? 0) === 0
            ? 'Ingen ventende'
            : `${passVentende} venter på godkjenning`
        }
        badge={
          (passVentende ?? 0) > 0 ? (
            <span
              style={{
                minWidth: 22,
                height: 22,
                padding: '0 8px',
                borderRadius: 999,
                background: 'var(--accent)',
                color: '#0a0a0a',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {passVentende}
            </span>
          ) : null
        }
      >
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            margin: '0 0 12px',
          }}
        >
          Tur-arrangører ber her om dagstilgang til passinfo. Forespørselen
          godkjennes eller avslås — godkjent gir 24 timers tilgang.
        </p>
        <Link
          href="/innstillinger/pass-godkjenninger"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            background: 'var(--accent-soft)',
            border: '0.5px solid var(--accent)',
            borderRadius: 999,
            color: 'var(--accent)',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          Åpne forespørsel-side →
        </Link>
      </InnstillingsKort>

      {/* Ønsker fra brukerne */}
      {(() => {
        const antall = aapneIssues.length
        let oppsummering = 'Ingen åpne'
        if (antall > 0) {
          // Issues kommer sortert nyest først (sort=created&direction=desc)
          const sisteIso = aapneIssues[0]?.created_at
          if (sisteIso) {
            const ms = Date.now() - new Date(sisteIso).getTime()
            const dager = Math.floor(ms / (24 * 60 * 60 * 1000))
            const sidenTekst =
              dager === 0 ? 'i dag' : dager === 1 ? '1 dag siden' : `${dager} dager siden`
            oppsummering = `${antall} ${antall === 1 ? 'åpent ønske' : 'åpne ønsker'} · siste ${sidenTekst}`
          } else {
            oppsummering = `${antall} ${antall === 1 ? 'åpent ønske' : 'åpne ønsker'}`
          }
        }
        return (
          <InnstillingsKort tittel="Ønsker fra brukerne" oppsummering={oppsummering}>
            <IssuesListe aapne={aapneIssues} />
          </InnstillingsKort>
        )
      })()}

      {/* Varselhistorikk */}
      <InnstillingsKort
        tittel="Varselhistorikk"
        oppsummering={
          `${varselTotal ?? 0} totalt · ${varselSisteDogn ?? 0} siste døgn`
        }
      >
        <VarselLogg initial={logg ?? []} total={varselTotal ?? 0} />
      </InnstillingsKort>

      {/* Ytelse — vitals inline */}
      <InnstillingsKort
        tittel="Ytelse"
        oppsummering={
          vitalsSammendrag.length === 0
            ? 'Ingen målinger siste uke'
            : `${vitalsSammendrag.length} av 5 metrics målt · mobil siste 7 d`
        }
      >
        {vitalsSammendrag.length === 0 ? (
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            Ingen vitals-målinger den siste uka. Brukerne må besøke appen for
            at det samles inn data.
          </p>
        ) : (
          <>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 12.5,
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                margin: '0 0 12px',
              }}
            >
              p75-verdier (mobil, siste 7 dager) — grønn = bra, gul = mellomlag, rød = bør fikses.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {vitalsSammendrag.map((v, i) => {
                const farge =
                  v.fargenavn === 'god'
                    ? 'var(--success)'
                    : v.fargenavn === 'ok'
                      ? 'var(--accent)'
                      : 'var(--danger)'
                return (
                  <div
                    key={v.metric}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 4px',
                      borderBottom:
                        i < vitalsSammendrag.length - 1
                          ? '0.5px solid var(--border-subtle)'
                          : 'none',
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: farge,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                        letterSpacing: '1px',
                        fontWeight: 600,
                        width: 50,
                      }}
                    >
                      {v.metric}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 13,
                        color: farge,
                      }}
                    >
                      {v.verdi}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        color: 'var(--text-tertiary)',
                      }}
                    >
                      n={v.n}
                    </span>
                  </div>
                )
              })}
            </div>
            <Link
              href="/innstillinger/vitals"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 14,
                padding: '8px 14px',
                background: 'var(--accent-soft)',
                border: '0.5px solid var(--accent)',
                borderRadius: 999,
                color: 'var(--accent)',
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Per rute, enhet og filter →
            </Link>
          </>
        )}
      </InnstillingsKort>
    </div>
  )
}
