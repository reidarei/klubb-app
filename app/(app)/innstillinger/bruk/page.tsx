import { createAdminClient } from '@/lib/supabase/admin'
import { getProfil } from '@/lib/auth-cache'
import { notFound } from 'next/navigation'
import { kanAdministrere } from '@/lib/roller'
import { osloUkestart, formaterDato } from '@/lib/dato'
import { AKTIVITET_GRAF_UKER, AKTIVITET_SNITT_DAGER } from '@/lib/konstanter'
import SectionLabel from '@/components/ui/SectionLabel'

type DagRad = { dag: string; unike: number; treff: number }
type UkeRad = { uke_start: string; unike: number }

export default async function AktivitetAdmin() {
  const profil = await getProfil()
  if (!kanAdministrere(profil?.rolle)) notFound()

  const admin = createAdminClient()
  const mandag = osloUkestart()

  // Hent nyeste først (enklest å plukke "siste N" uten dato-aritmetikk),
  // reverser til kronologisk rekkefølge (eldst → nyest) for grafene.
  const [
    { data: dagerDataRaw, error: dagerFeil },
    { data: ukerDataRaw, error: ukerFeil },
  ] = await Promise.all([
    admin
      .from('aktivitet_dag')
      .select('dag, unike, treff')
      .order('dag', { ascending: false })
      .limit(AKTIVITET_GRAF_UKER * 7),
    admin
      .from('aktivitet_uke')
      .select('uke_start, unike')
      .order('uke_start', { ascending: false })
      .limit(AKTIVITET_GRAF_UKER),
  ])
  // Statistikkside — en feilet spørring skal ikke vise et feilaktig 0 i
  // nøkkeltallene (Policy: Databasespørringer, aggregater).
  if (dagerFeil) throw new Error(`Kunne ikke hente aktivitet_dag: ${dagerFeil.message}`)
  if (ukerFeil) throw new Error(`Kunne ikke hente aktivitet_uke: ${ukerFeil.message}`)

  const dagerDesc = (dagerDataRaw ?? []) as DagRad[]
  const ukerDesc = (ukerDataRaw ?? []) as UkeRad[]

  // Nøkkeltall
  const siste30 = dagerDesc.slice(0, AKTIVITET_SNITT_DAGER)
  const snittDau = siste30.length
    ? Math.round(siste30.reduce((sum, r) => sum + r.unike, 0) / siste30.length)
    : 0
  const snittTreff = siste30.length
    ? Math.round(siste30.reduce((sum, r) => sum + r.treff, 0) / siste30.length)
    : 0

  // WAU = siste FULLFØRTE uke — ekskluder inneværende (ufullstendige) uke
  // hvis den finnes i utvalget.
  const fullforteUker = ukerDesc.filter(r => r.uke_start !== mandag)
  const wau = fullforteUker[0]?.unike ?? 0

  const dagerGraf = [...dagerDesc].reverse()
  const ukerGraf = [...ukerDesc].reverse()

  return (
    <div style={{ padding: '20px 20px 120px' }}>
      <header style={{ marginBottom: 18 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)',
            letterSpacing: '1.6px', textTransform: 'uppercase', marginBottom: 6, fontWeight: 600,
          }}
        >
          Admin · Bruk
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500,
            letterSpacing: '-0.4px', margin: 0, color: 'var(--text-primary)',
          }}
        >
          Aktivitet
        </h1>
        <div
          style={{
            marginTop: 6, fontFamily: 'var(--font-body)', fontSize: 13,
            color: 'var(--text-secondary)',
          }}
        >
          Anonym telling — ingen kobling til enkeltmedlemmer.
        </div>
      </header>

      {/* Nøkkeltall */}
      <section style={{ marginBottom: 28 }}>
        <SectionLabel>Nøkkeltall</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Nokkeltall
            label={`Snitt unike (per enhet) / dag, siste ${AKTIVITET_SNITT_DAGER} d`}
            verdi={snittDau}
            hovedtall
          />
          <Nokkeltall label="Unike (per enhet), siste fullførte uke" verdi={wau} />
          <Nokkeltall label={`Snitt treff / dag, siste ${AKTIVITET_SNITT_DAGER} d`} verdi={snittTreff} />
        </div>
      </section>

      {/* Grafer */}
      <section style={{ marginBottom: 28 }}>
        <SectionLabel>Unike per dag, siste {dagerGraf.length} d</SectionLabel>
        <BarGraf data={dagerGraf.map(r => ({ nokkel: r.dag, verdi: r.unike }))} />
      </section>

      <section style={{ marginBottom: 28 }}>
        <SectionLabel>Unike per uke, siste {ukerGraf.length} uker</SectionLabel>
        <BarGraf data={ukerGraf.map(r => ({ nokkel: r.uke_start, verdi: r.unike }))} />
      </section>

      {/* Microcopy */}
      <div
        style={{
          fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--text-tertiary)',
          lineHeight: 1.5,
        }}
      >
        Samme person på to enheter (f.eks. mobil og PC) teller som to unike.
        En enhet som er borte i over en uke, telles som ny igjen når den er
        tilbake — det finnes ingen langtids-identifikator å kjenne den på.
      </div>
    </div>
  )
}

function Nokkeltall({ label, verdi, hovedtall }: { label: string; verdi: number; hovedtall?: boolean }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10,
        padding: '10px 12px', borderRadius: 8, background: 'var(--bg-elevated)',
        border: '0.5px solid var(--border-subtle)',
      }}
    >
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--text-secondary)' }}>
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: hovedtall ? 22 : 16,
          fontWeight: 600,
          color: hovedtall ? 'var(--accent)' : 'var(--text-primary)',
        }}
      >
        {verdi}
      </span>
    </div>
  )
}

// Enkel vertikal kolonnegraf uten npm-dep — flexbox-divs med height i %
// mot seriens maksverdi. Nok for en admin-only trendvisning.
function BarGraf({ data }: { data: { nokkel: string; verdi: number }[] }) {
  if (data.length === 0) {
    return (
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
        Ingen data ennå.
      </p>
    )
  }
  const maks = Math.max(...data.map(d => d.verdi), 1)
  // Synlige ytter-etiketter (første/siste) fordi title-attributtet ikke vises
  // ved touch på mobil — gir leseren dato-kontekst uten en npm-akse-dep.
  const forste = formaterDato(data[0].nokkel, 'd. MMM')
  const siste = formaterDato(data[data.length - 1].nokkel, 'd. MMM')
  return (
    <div>
      <div
        style={{
          display: 'flex', alignItems: 'flex-end', gap: 3, height: 100,
          padding: '10px 8px', borderRadius: 8, background: 'var(--bg-elevated)',
          border: '0.5px solid var(--border-subtle)',
        }}
      >
        {data.map(d => (
          <div
            key={d.nokkel}
            title={`${d.nokkel}: ${d.verdi}`}
            style={{
              flex: 1,
              height: `${Math.max((d.verdi / maks) * 100, d.verdi > 0 ? 4 : 0)}%`,
              minHeight: d.verdi > 0 ? 2 : 0,
              background: 'var(--accent)',
              borderRadius: '2px 2px 0 0',
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: 'flex', justifyContent: 'space-between', marginTop: 5,
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-tertiary)',
        }}
      >
        <span>{forste}</span>
        {/* Skjul siste hvis serien har bare ett punkt (samme dato begge ender). */}
        {data.length > 1 && <span>{siste}</span>}
      </div>
    </div>
  )
}
