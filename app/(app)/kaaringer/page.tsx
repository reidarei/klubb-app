import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { getProfil } from '@/lib/auth-cache'
import { norskAar } from '@/lib/dato'
import KaaringerVisning from './KaaringerVisning'
import { kanAdministrere } from '@/lib/roller'

const KLUBBEN_START_AAR = 2008

export default async function Kaaringer() {
  const [supabase, profil] = await Promise.all([createServerClient(), getProfil()])

  const erAdmin = kanAdministrere(profil?.rolle)
  const gjeldende_aar = norskAar()

  const [
    { data: maler },
    { data: vinnere },
    { data: medlemmer },
    { data: arrangementer },
  ] = await Promise.all([
    supabase
      .from('kaaringmaler')
      .select('id, navn, rekkefolge')
      .order('rekkefolge'),
    supabase
      .from('kaaring_vinnere')
      .select(
        `
        id, mal_id, aar, begrunnelse,
        profil_id, profiles (navn),
        arrangement_id, arrangementer (tittel)
      `,
      )
      .order('aar', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, navn')
      .eq('aktiv', true)
      .order('navn'),
    supabase
      .from('arrangementer')
      .select('id, tittel, start_tidspunkt')
      .order('start_tidspunkt', { ascending: false }),
  ])

  // År fra 2008 til nå, pluss evt. eldre med vinnere
  const aarSet = new Set<number>()
  for (const v of vinnere ?? []) aarSet.add(v.aar)
  for (let y = KLUBBEN_START_AAR; y <= gjeldende_aar; y++) aarSet.add(y)
  const aarListe = Array.from(aarSet).sort((a, b) => b - a)

  const harMaler = (maler?.length ?? 0) > 0

  return (
    <div style={{ padding: '0 20px 20px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28, marginTop: 12 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--text-tertiary)',
                letterSpacing: '2px',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              Kåringer
            </div>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 38,
                fontWeight: 500,
                color: 'var(--text-primary)',
                letterSpacing: '-0.5px',
                margin: 0,
                lineHeight: 1,
              }}
            >
              Hall of Fame
            </h1>
          </div>
          {erAdmin && (
            <Link
              href="/kaaringspoll/ny"
              style={{
                display: 'inline-block',
                padding: '8px 16px',
                background: 'var(--accent-soft)',
                border: '0.5px solid var(--border-strong)',
                borderRadius: 999,
                color: 'var(--accent)',
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              Ny kåring
            </Link>
          )}
        </div>
      </div>

      {!harMaler ? (
        <div
          style={{
            padding: '48px 16px',
            textAlign: 'center',
            border: '0.5px solid var(--border-subtle)',
            borderRadius: 'var(--radius)',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--text-tertiary)',
              fontStyle: 'italic',
            }}
          >
            Ingen kåringer er definert ennå.
          </div>
        </div>
      ) : (
        <KaaringerVisning
          maler={maler ?? []}
          vinnere={(vinnere ?? []) as never}
          aarListe={aarListe}
          startAar={gjeldende_aar}
          erAdmin={erAdmin}
          medlemmer={medlemmer ?? []}
          arrangementer={arrangementer ?? []}
        />
      )}
    </div>
  )
}
