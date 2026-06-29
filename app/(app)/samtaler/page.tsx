import Link from 'next/link'
import { createServerClient } from '@/lib/supabase/server'
import { getInnloggetBruker } from '@/lib/auth-cache'
import Avatar from '@/components/ui/Avatar'
import SectionLabel from '@/components/ui/SectionLabel'
import { formatDistanceToNowStrict } from 'date-fns'
import { nb } from 'date-fns/locale'

type SamtaleRad = {
  id: string
  profil_a: string
  profil_b: string
  sist_aktivitet: string
}

type ChatRad = {
  id: string
  samtale_id: string
  profil_id: string
  innhold: string | null
  bilde_url: string | null
  opprettet: string
  lest: boolean
}

type ProfilRad = {
  id: string
  navn: string | null
  visningsnavn: string | null
  bilde_url: string | null
  rolle: string | null
}

export default async function SamtalerInbox() {
  const [supabase, user] = await Promise.all([
    createServerClient(),
    getInnloggetBruker(),
  ])
  if (!user) return null

  // RLS gjør at vi kun ser samtaler vi er i — ingen ekstra filter trengs.
  const { data: samtaler } = await supabase
    .from('samtale')
    .select('id, profil_a, profil_b, sist_aktivitet')
    .order('sist_aktivitet', { ascending: false })

  const samtaleListe = (samtaler ?? []) as SamtaleRad[]

  if (samtaleListe.length === 0) {
    return (
      <div style={{ padding: '0 20px 20px' }}>
        <header style={{ marginTop: 12, marginBottom: 22 }}>
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
            Samtaler
          </h1>
        </header>
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-tertiary)',
            letterSpacing: '0.5px',
          }}
        >
          Ingen samtaler ennå. Åpne en medlemsprofil og trykk «Send melding».
        </p>
      </div>
    )
  }

  // Hent siste melding + ulest-status per samtale i én query.
  const samtaleIder = samtaleListe.map(s => s.id)
  const motpartIder = samtaleListe.map(s =>
    s.profil_a === user.id ? s.profil_b : s.profil_a,
  )

  const [{ data: alleMeldinger }, { data: profiler }] = await Promise.all([
    supabase
      .from('samtale_chat')
      .select('id, samtale_id, profil_id, innhold, bilde_url, opprettet, lest')
      .in('samtale_id', samtaleIder)
      .order('opprettet', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, navn, visningsnavn, bilde_url, rolle')
      .in('id', motpartIder),
  ])

  const meldinger = (alleMeldinger ?? []) as ChatRad[]
  const profilMap = new Map<string, ProfilRad>(
    ((profiler ?? []) as ProfilRad[]).map(p => [p.id, p]),
  )

  // Topp 1 melding per samtale (queryen er sortert synkende på opprettet
  // så .find() gir den nyeste). Antall ulest = antall meldinger fra
  // motparten med lest=false.
  const sisteMeldingPer = new Map<string, ChatRad>()
  const ulestAntallPer = new Map<string, number>()
  for (const m of meldinger) {
    if (!sisteMeldingPer.has(m.samtale_id)) sisteMeldingPer.set(m.samtale_id, m)
    if (!m.lest && m.profil_id !== user.id) {
      ulestAntallPer.set(m.samtale_id, (ulestAntallPer.get(m.samtale_id) ?? 0) + 1)
    }
  }

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <header style={{ marginTop: 12, marginBottom: 22 }}>
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
          Samtaler
        </h1>
      </header>

      <SectionLabel count={samtaleListe.length}>Privatmeldinger</SectionLabel>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {samtaleListe.map((s, i) => {
          const motpartId = s.profil_a === user.id ? s.profil_b : s.profil_a
          const motpart = profilMap.get(motpartId)
          const siste = sisteMeldingPer.get(s.id)
          const ulest = ulestAntallPer.get(s.id) ?? 0
          const navn = motpart?.visningsnavn || motpart?.navn || 'Ukjent'

          return (
            <Link
              key={s.id}
              href={`/samtaler/${s.id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 4px',
                borderBottom:
                  i < samtaleListe.length - 1 ? '0.5px solid var(--border-subtle)' : 'none',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <Avatar
                name={navn}
                size={42}
                src={motpart?.bilde_url ?? null}
                rolle={motpart?.rolle ?? null}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 14,
                      fontWeight: ulest > 0 ? 600 : 500,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {navn}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 10,
                      color: 'var(--text-tertiary)',
                      letterSpacing: '1px',
                      textTransform: 'uppercase',
                      flexShrink: 0,
                    }}
                  >
                    {formatDistanceToNowStrict(new Date(s.sist_aktivitet), {
                      locale: nb,
                      addSuffix: false,
                    })}
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 3,
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontFamily: 'var(--font-body)',
                      fontSize: 13,
                      color: ulest > 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontWeight: ulest > 0 ? 500 : 400,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {siste
                      ? (siste.profil_id === user.id ? 'Du: ' : '') +
                        (siste.innhold ?? (siste.bilde_url ? '📷 Bilde' : ''))
                      : 'Ingen meldinger ennå'}
                  </span>
                  {ulest > 0 && (
                    <span
                      style={{
                        flexShrink: 0,
                        minWidth: 18,
                        height: 18,
                        padding: '0 6px',
                        borderRadius: 999,
                        background: 'var(--accent)',
                        color: 'var(--accent-foreground)',
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
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
