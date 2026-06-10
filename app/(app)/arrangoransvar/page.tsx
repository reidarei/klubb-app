import { createServerClient } from '@/lib/supabase/server'
import { getInnloggetBruker, getProfil } from '@/lib/auth-cache'
import Link from 'next/link'
import AnsvarAdmin from './AnsvarAdmin'
import PurreKnapp from './PurreKnapp'
import LeggTilAarKnapp from './LeggTilAarKnapp'
import SectionLabel from '@/components/ui/SectionLabel'
import { norskAar, norskDag, norskDatoNaa } from '@/lib/dato'
import { isBefore } from 'date-fns'
import { kanAdministrere } from '@/lib/roller'
import { utkastAnkerId } from '@/components/agenda/UtkastKort'

type AnsvarRad = {
  id: string
  aar: number
  arrangement_navn: string
  ansvarlig_id: string | null
  purredato: string | null
  profiles: { id: string; navn: string | null } | null
  arrangementer: { id: string; tittel: string; start_tidspunkt: string } | null
}

// Grupperer ansvar-rader per (aar, arrangement_navn) og bygger en liste klar
// for rendering. Sorteringen i hvert år: purredato stigende, null sist.
function bygMalRader(ansvar: AnsvarRad[]) {
  const perAar = new Map<number, Map<string, AnsvarRad[]>>()
  for (const r of ansvar) {
    if (!perAar.has(r.aar)) perAar.set(r.aar, new Map())
    const navnMap = perAar.get(r.aar)!
    const key = r.arrangement_navn
    if (!navnMap.has(key)) navnMap.set(key, [])
    navnMap.get(key)!.push(r)
  }

  const aarSortert = Array.from(perAar.keys()).sort((a, b) => a - b)
  return aarSortert.map(aar => {
    const navnMap = perAar.get(aar)!
    const rader = Array.from(navnMap.entries()).map(([navn, rs]) => {
      // Bruk første rads purredato for sortering (alle rader for samme
      // (aar, navn) skal i praksis ha samme purredato siden den arves fra mal).
      const purredato = rs.find(r => r.purredato)?.purredato ?? null
      return { navn, purredato, rader: rs }
    })
    rader.sort((a, b) => {
      if (a.purredato == null && b.purredato == null) return a.navn.localeCompare(b.navn)
      if (a.purredato == null) return 1
      if (b.purredato == null) return -1
      return a.purredato.localeCompare(b.purredato)
    })
    return { aar, rader }
  })
}

export default async function Arrangoransvar() {
  const supabase = await createServerClient()
  const [user, profil] = await Promise.all([getInnloggetBruker(), getProfil()])
  const erAdmin = kanAdministrere(profil?.rolle)

  const [{ data: ansvar }, { data: medlemmer }] = await Promise.all([
    supabase
      .from('arrangoransvar')
      .select(`id, aar, arrangement_navn, ansvarlig_id, purredato, profiles (id, navn), arrangementer (id, tittel, start_tidspunkt)`)
      .order('aar'),
    supabase.from('profiles').select('id, navn').eq('aktiv', true).order('navn'),
  ])

  const aarGrupper = bygMalRader((ansvar ?? []) as unknown as AnsvarRad[])

  // Knappen tilbyr alltid neste år som ikke har rader. Hvis ingen år finnes,
  // foreslås innevaerende år. Hvis siste år allerede er innevaerende+1 eller
  // lenger frem, foreslås neste fra det.
  const sisteAar = aarGrupper.length > 0 ? aarGrupper[aarGrupper.length - 1].aar : norskAar() - 1
  const nesteAar = Math.max(sisteAar + 1, norskAar())

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
          Klubbinfo / Ansvar
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
          Arrangøransvar
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
          De faste arrangementene og hvem som har ansvar for å få dem inn i kalenderen. Trykk «Purre» for å minne den ansvarlige på det.
        </p>
      </header>

      {aarGrupper.length === 0 && (
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--text-secondary)',
            marginBottom: 20,
          }}
        >
          Ingen arrangøransvar registrert ennå.
        </p>
      )}

      {aarGrupper.map(({ aar, rader }) => (
        <section key={aar} style={{ marginBottom: 28 }}>
          <SectionLabel>{String(aar)}</SectionLabel>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {rader.map(({ navn, rader: malRader }, i) => {
              const erMitt = malRader.some(r => r.ansvarlig_id === user!.id)
              const lenketArr = malRader.find(r => r.arrangementer)?.arrangementer
              const lagtInn = !!lenketArr
              const gjennomfoert = lenketArr
                ? isBefore(norskDag(lenketArr.start_tidspunkt), norskDatoNaa())
                : false
              const statusFarge = lagtInn ? 'var(--success)' : 'var(--danger)'
              const statusTekst = gjennomfoert ? 'Gjennomført' : lagtInn ? 'Lagt inn' : 'Ikke lagt inn'
              const ansvarligeMedNavn = malRader.filter(r => r.profiles).map(r => r.profiles!)
              const ansvarligIder = malRader.filter(r => r.ansvarlig_id).map(r => ({
                ansvarId: r.id,
                profilId: r.ansvarlig_id!,
              }))
              const kanPurres = !lagtInn && ansvarligIder.length > 0 && !erMitt
              const forsteAnsvarId = ansvarligIder[0]?.ansvarId

              return (
                <div
                  key={navn}
                  id={utkastAnkerId(aar, navn)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 14,
                    padding: '16px 4px',
                    scrollMarginTop: 24,
                    borderBottom:
                      i < rader.length - 1 ? '0.5px solid var(--border-subtle)' : 'none',
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: statusFarge,
                      flexShrink: 0,
                      marginTop: 7,
                      boxShadow: `0 0 0 3px color-mix(in srgb, ${statusFarge} 18%, transparent)`,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 18,
                        fontWeight: 500,
                        color: erMitt ? 'var(--accent)' : 'var(--text-primary)',
                        letterSpacing: '-0.2px',
                        lineHeight: 1.15,
                        marginBottom: 3,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      {navn}
                      {erMitt && (
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 9,
                            color: 'var(--accent)',
                            letterSpacing: '1.4px',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                          }}
                        >
                          Deg
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 13,
                        color: 'var(--text-secondary)',
                        letterSpacing: '0.1px',
                      }}
                    >
                      {ansvarligeMedNavn.length > 0
                        ? ansvarligeMedNavn.map(p => p.navn).join(', ')
                        : 'Ingen ansvarlig'}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      {lenketArr ? (
                        <Link
                          href={`/arrangementer/${lenketArr.id}`}
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            color: statusFarge,
                            letterSpacing: '1.4px',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            textDecoration: 'none',
                          }}
                        >
                          {statusTekst} →
                        </Link>
                      ) : (
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 10,
                            color: statusFarge,
                            letterSpacing: '1.4px',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                          }}
                        >
                          {statusTekst}
                        </span>
                      )}
                    </div>
                    {erAdmin && (
                      <AnsvarAdmin
                        ansvarlige={ansvarligIder}
                        arrangementNavn={navn}
                        aar={aar}
                        medlemmer={medlemmer ?? []}
                      />
                    )}
                  </div>
                  {kanPurres && forsteAnsvarId && (
                    <PurreKnapp ansvarId={forsteAnsvarId} arrangementNavn={navn} />
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}

      {erAdmin && <LeggTilAarKnapp aar={nesteAar} />}
    </div>
  )
}
