import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfil } from '@/lib/auth-cache'
import { notFound } from 'next/navigation'
import TilbakeKnapp from '@/components/ui/TilbakeKnapp'
import AdminMerke from '@/components/ui/AdminMerke'
import { PanelGruppe, PanelRad } from '@/components/innstillinger/PanelRad'
import { hentAapneIssues } from './IssuesListe'
import { kanAdministrere, godkjennerPassTilgang } from '@/lib/roller'
import { hentAppFlagg, FOND_FANE, CHAT_FANE, REISEMODUS, MOETEMODUS, BURSDAGSBILDE } from '@/lib/app-innstillinger'
import { SYMBOLER_VARSLER } from '@/lib/markering-symboler'
import { AKTIVITET_SNITT_DAGER } from '@/lib/konstanter'
import { BURSDAGSBILDE_PAA } from '@/lib/config'

// Kontrollpanelets forside: én rad per område, med status til høyre. Selve
// bryterne og listene bor på undersidene, så forsiden henter bare det som
// trengs for å vise status.
export default async function Kontrollpanel() {
  const [supabase, profil] = await Promise.all([createServerClient(), getProfil()])
  if (!kanAdministrere(profil?.rolle)) notFound()
  const erGeneralsekretaer = godkjennerPassTilgang(profil?.rolle)

  const admin = createAdminClient()
  const sisteDognIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [
    { data: varselRader, error: varselFeil },
    { count: antallMaler, error: malerFeil },
    { count: antallKaaringmaler, error: kaaringmalerFeil },
    { count: passVentende, error: passFeil },
    { count: varslerSisteDogn, error: varslerSisteDognFeil },
    { data: aktivitetDager, error: aktivitetFeil },
    aapneIssues,
    ...flagg
  ] = await Promise.all([
    supabase.from('varsel_innstillinger').select('noekkel, aktiv'),
    admin.from('arrangementmaler').select('id', { count: 'exact', head: true }),
    admin.from('kaaringmaler').select('id', { count: 'exact', head: true }),
    admin
      .from('pass_tilgang_forespørsel')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'venter'),
    // Ufiltrert volum-mål, chat inkludert — samme tall som før ombyggingen.
    admin
      .from('varsel_logg')
      .select('id', { count: 'exact', head: true })
      .gte('opprettet', sisteDognIso),
    admin
      .from('aktivitet_dag')
      .select('unike')
      .order('dag', { ascending: false })
      .limit(AKTIVITET_SNITT_DAGER),
    hentAapneIssues(),
    hentAppFlagg(supabase, FOND_FANE),
    hentAppFlagg(supabase, CHAT_FANE, true),
    // Kill-switcher og KI-flagg faller tilbake til av (#723, #780, #641).
    hentAppFlagg(supabase, REISEMODUS, false),
    hentAppFlagg(supabase, MOETEMODUS, false),
    ...(BURSDAGSBILDE_PAA ? [hentAppFlagg(supabase, BURSDAGSBILDE, false)] : []),
  ])
  // Status på forsiden er det admin styrer etter — en svelget feil ville vist
  // et feilaktig «0» eller «av» (Policy: Databasespørringer).
  if (varselFeil) throw new Error(`Kunne ikke hente varsel_innstillinger: ${varselFeil.message}`)
  if (malerFeil) throw new Error(`Kunne ikke telle arrangementmaler: ${malerFeil.message}`)
  if (kaaringmalerFeil) throw new Error(`Kunne ikke telle kåringmaler: ${kaaringmalerFeil.message}`)
  if (passFeil) throw new Error(`Kunne ikke telle ventende pass: ${passFeil.message}`)
  if (varslerSisteDognFeil) throw new Error(`Kunne ikke telle varsler siste døgn: ${varslerSisteDognFeil.message}`)
  if (aktivitetFeil) throw new Error(`Kunne ikke hente aktivitet_dag: ${aktivitetFeil.message}`)

  // Varselbrytere: symbol-typer uten rad i tabellen er aktive (se varsler/page.tsx).
  // Testmodus er ikke en varseltype og telles ikke — den vises som egen status.
  const rader = varselRader ?? []
  const kjente = new Set(rader.map(r => r.noekkel))
  const varselBrytere = [
    ...rader.filter(r => r.noekkel !== 'test_modus'),
    ...SYMBOLER_VARSLER.filter(s => !kjente.has(s.varsel.type)).map(() => ({ aktiv: true })),
  ]
  const varslerPaa = varselBrytere.filter(r => r.aktiv).length
  const testModus = rader.some(r => r.noekkel === 'test_modus' && r.aktiv)

  const funksjonerPaa = flagg.filter(Boolean).length

  const dager = aktivitetDager ?? []
  const snittPerDag = dager.length
    ? Math.round(dager.reduce((sum, r) => sum + r.unike, 0) / dager.length)
    : null

  const ventendePass = passVentende ?? 0

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <header style={{ marginTop: 12, marginBottom: 26 }}>
        <div style={{ marginBottom: 4 }}>
          <TilbakeKnapp href="/klubbinfo" til="Klubbinfo" />
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.6px',
            textTransform: 'uppercase',
            marginBottom: 6,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AdminMerke size={16} />
          Kun for admin
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: '-0.4px',
            margin: 0,
            color: 'var(--text-primary)',
          }}
        >
          Kontrollpanel
        </h1>
      </header>

      <PanelGruppe tittel="Saker som venter">
        {/* Pass-godkjenninger er generalsekretær-only (#582) — vanlige admins
            ser ikke raden, siden de heller ikke kan avgjøre. */}
        {erGeneralsekretaer && (
          <PanelRad
            href="/innstillinger/pass-godkjenninger"
            ikon="doc"
            farge="rosa"
            tittel="Passinfo-forespørsler"
            undertekst="Bare generalsekretæren ser denne"
            status={ventendePass > 0 ? `${ventendePass} venter` : 'Ingen'}
            tone={ventendePass > 0 ? 'varsle' : 'noeytral'}
          />
        )}
        <PanelRad
          href="/innstillinger/onsker"
          ikon="message"
          farge="gul"
          tittel="Ønsker fra brukerne"
          status={aapneIssues.length > 0 ? `${aapneIssues.length} åpne` : 'Ingen'}
          tone={aapneIssues.length > 0 ? 'varsle' : 'noeytral'}
        />
      </PanelGruppe>

      <PanelGruppe tittel="Styr appen">
        <PanelRad
          href="/innstillinger/varsler"
          ikon="bell"
          farge="gul"
          tittel="Varsler"
          status={testModus ? 'Testmodus på' : `${varslerPaa} av ${varselBrytere.length} på`}
          tone={testModus ? 'varsle' : 'noeytral'}
        />
        <PanelRad
          href="/innstillinger/funksjoner"
          ikon="cog"
          farge="groenn"
          tittel="Funksjoner"
          status={`${funksjonerPaa} av ${flagg.length} på`}
        />
        <PanelRad href="/innstillinger/kart" ikon="map" farge="blaa" tittel="Kartmarkeringer" />
      </PanelGruppe>

      <PanelGruppe tittel="Innhold">
        <PanelRad href="/innstillinger/om-klubben" ikon="building" farge="blaa" tittel="Om klubben" />
        <PanelRad
          href="/innstillinger/faste-arrangementer"
          ikon="calendar"
          farge="lilla"
          tittel="Faste arrangementer"
          status={`${antallMaler ?? 0} ${antallMaler === 1 ? 'mal' : 'maler'}`}
        />
        <PanelRad
          href="/innstillinger/kaaringer"
          ikon="trophy"
          farge="sand"
          tittel="Kåringer"
          status={`${antallKaaringmaler ?? 0} ${antallKaaringmaler === 1 ? 'mal' : 'maler'}`}
        />
        <PanelRad href="/innstillinger/bursdagsbilde" ikon="cake" farge="rosa" tittel="Bursdagsbilder" />
      </PanelGruppe>

      <PanelGruppe tittel="Drift">
        <PanelRad
          href="/innstillinger/varselhistorikk"
          ikon="list"
          farge="graa"
          tittel="Varselhistorikk"
          status={`${varslerSisteDogn ?? 0} siste døgn`}
        />
        <PanelRad
          href="/innstillinger/bruk"
          ikon="chart"
          farge="turkis"
          tittel="Bruk"
          status={snittPerDag === null ? undefined : `${snittPerDag} per dag`}
        />
        <PanelRad href="/innstillinger/vitals" ikon="flame" farge="groenn" tittel="Ytelse" />
      </PanelGruppe>
    </div>
  )
}
