import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfil } from '@/lib/auth-cache'
import { kanAdministrere, rollerMed } from '@/lib/roller'
import { VARSEL_REKKEFOLGE, varselPanelNavn } from '@/lib/varsel-typer'
import { SYMBOLER_VARSLER } from '@/lib/markering-symboler'
import { hentKartSymboler } from '@/lib/kart-symbol-tilpasning'
import UndersideHode from '@/components/innstillinger/UndersideHode'
import BryterBoks from '@/components/innstillinger/BryterBoks'
import VarselToggle from '@/components/VarselToggle'
import TestEpostVelger from '../TestEpostVelger'

// Gruppene varslene vises i, i visningsrekkefølge. Ukjente nøkler havner i
// «Andre», så en ny varseltype aldri forsvinner fra panelet bare fordi den
// ikke er plassert i en gruppe her.
const GRUPPER: { tittel: string; noekler: string[] }[] = [
  {
    tittel: 'Arrangementer',
    noekler: [
      'nytt_arrangement', 'oppdatert', 'paaminnelse_7d', 'paaminnelse_1d',
      'purring_aktiv', 'purring_manuell', 'purring_kanskje', 'arrangor_purring', 'purring_ansvar',
    ],
  },
  {
    tittel: 'Chat, innlegg og avstemminger',
    noekler: [
      'melding-ny', 'ny_poll', 'mention', 'chat_klubb', 'chat_arrangement',
      'chat_poll', 'chat_melding', 'chat_albumbilde', 'privat-melding',
    ],
  },
  {
    tittel: 'Kåringer',
    noekler: ['kaaringspoll_opprettet', 'kaaringspoll_vinner', 'kaaringspoll_tiebreak', 'kaaringspoll_ingen_stemmer'],
  },
  {
    tittel: 'Kart og bursdag',
    // Kartmarkeringene som varsler er klubb-konfigurerbare, derfor hentes de fra registeret.
    noekler: [...SYMBOLER_VARSLER.map(s => s.varsel.type), 'posisjon_pling', 'bursdag_i_dag'],
  },
  {
    tittel: 'Til admin og den det gjelder',
    noekler: ['pass-forespørsel', 'pass-godkjent', 'pass-avslatt', 'ønske_ny', 'ønske_lukket', 'klient_alarm'],
  },
]

export default async function VarslerKontroll() {
  const [supabase, profil] = await Promise.all([createServerClient(), getProfil()])
  if (!kanAdministrere(profil?.rolle)) notFound()

  const admin = createAdminClient()
  const [
    { count: pushCount, error: pushCountFeil },
    { data: innstillinger, error: innstillingerFeil },
    { data: adminProfiler, error: adminProfilerFeil },
    kartSymboler,
  ] = await Promise.all([
    admin.from('push_subscriptions').select('id', { count: 'exact', head: true }),
    supabase.from('varsel_innstillinger').select('noekkel, aktiv, beskrivelse').order('noekkel'),
    admin
      .from('profiles')
      .select('navn, epost')
      .eq('aktiv', true)
      .in('rolle', rollerMed('kanAdministrere'))
      .order('navn'),
    hentKartSymboler(supabase),
  ])
  // En svelget feil her ville vist brytere i feil tilstand, og admin ville
  // styrt ut fra feil grunnlag (Policy: Databasespørringer).
  if (pushCountFeil) throw new Error(`Kunne ikke telle push-abonnementer: ${pushCountFeil.message}`)
  if (innstillingerFeil) throw new Error(`Kunne ikke hente varsel_innstillinger: ${innstillingerFeil.message}`)
  if (adminProfilerFeil) throw new Error(`Kunne ikke hente adminprofiler: ${adminProfilerFeil.message}`)

  // Migrasjon 152 (#767) seeder ikke rader for symbol-avledede varseltyper —
  // settet er klubb-konfigurerbart. Uten fletten ville bryteren for et slikt
  // symbol forsvunnet. aktiv: true speiler fallbacken i erVarselAktiv()
  // (lib/varsler.ts): ingen rad betyr aktiv.
  const kjente = new Set((innstillinger ?? []).map(i => i.noekkel))
  const syntetiske = SYMBOLER_VARSLER.filter(s => !kjente.has(s.varsel.type)).map(s => ({
    noekkel: s.varsel.type,
    aktiv: true,
    beskrivelse: null as string | null,
  }))
  const alle = [...(innstillinger ?? []), ...syntetiske]
  const perNoekkel = new Map(alle.map(i => [i.noekkel, i]))

  const rekkefolge = (n: string) => {
    const i = VARSEL_REKKEFOLGE.indexOf(n)
    return i === -1 ? Number.MAX_SAFE_INTEGER : i
  }
  const plassert = new Set(GRUPPER.flatMap(g => g.noekler))
  const grupper = [
    ...GRUPPER.map(g => ({
      tittel: g.tittel,
      rader: g.noekler.flatMap(n => (perNoekkel.has(n) ? [perNoekkel.get(n)!] : [])),
    })),
    {
      tittel: 'Andre',
      rader: alle
        .filter(i => !plassert.has(i.noekkel) && i.noekkel !== 'test_modus')
        .sort((a, b) => rekkefolge(a.noekkel) - rekkefolge(b.noekkel) || a.noekkel.localeCompare(b.noekkel)),
    },
  ].filter(g => g.rader.length > 0)
  const testModus = perNoekkel.get('test_modus')

  // Kart-alertene får navnet admin har gitt symbolet på /innstillinger/kart.
  const symbolPanel = new Map<string, string>(
    kartSymboler.flatMap(s => (s.varsel ? [[s.varsel.type, s.varsel.panel] as const] : [])),
  )
  const antallPush = pushCount ?? 0

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <UndersideHode
        tittel="Varsler"
        ingress={`Skrur du av en type, får ingen den, uansett hva de har valgt selv. ${antallPush} ${antallPush === 1 ? 'enhet' : 'enheter'} har push på.`}
      />

      {grupper.map(g => (
        <BryterBoks key={g.tittel} tittel={g.tittel}>
          {g.rader.map((inn, i) => (
            <VarselToggle
              key={inn.noekkel}
              noekkel={inn.noekkel}
              aktiv={inn.aktiv}
              beskrivelse={symbolPanel.get(inn.noekkel) ?? varselPanelNavn(inn.noekkel, inn.beskrivelse)}
              last={i === g.rader.length - 1}
            />
          ))}
        </BryterBoks>
      ))}

      {testModus && (
        <BryterBoks
          tittel="Test"
          fotnote="På: alle varsler går bare til test-eposten. Ingen andre får push eller e-post før du skrur det av igjen."
        >
          <VarselToggle
            noekkel="test_modus"
            aktiv={testModus.aktiv}
            beskrivelse="Testmodus"
            last
          />
          {/* For test_modus er beskrivelse-feltet selve test-eposten */}
          <TestEpostVelger valgt={testModus.beskrivelse} admins={adminProfiler ?? []} />
        </BryterBoks>
      )}
    </div>
  )
}
