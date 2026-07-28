import { addDays } from 'date-fns'
import { ensureAdmin } from '@/lib/auth'
import { norskAar, norskDatoNaa } from '@/lib/dato'
import OpprettSkjema from './OpprettSkjema'

// Hvor langt tilbake i tid vi henter arrangementer som kan kobles til en
// kåringspoll. Sju dager er bredt nok til å fange julebordet selv om
// kåringen opprettes dagen etter, men ikke så bredt at listen flommer.
const ARRANGEMENT_TILBAKE_DAGER = 7

// Generalsekretær-vennlig opprett-side for kåringspoll. Server-rendret
// første halvdel henter maler + counts av potensielle kandidater så
// klienten kan vise antall direkte i nedtrekksmenyen uten ekstra
// nettverkskall.
export default async function NyKaaringspoll() {
  const { supabase } = await ensureAdmin()
  const aar = norskAar()
  // Vinduet starter sju dager før norsk dato — dekker arrangementer som
  // nettopp er ferdig (typisk julebord kvelden før). Vi caster Date til
  // ISO via toISOString() for Postgres-sammenligning.
  const tidligsteArrIso = addDays(norskDatoNaa(), -ARRANGEMENT_TILBAKE_DAGER).toISOString()

  const [
    { data: maler, error: malerFeil },
    { count: medlemAntall, error: medlemAntallFeil },
    { data: aaretsMoeter, error: aaretsMoeterFeil },
    { data: aktuelleArr, error: aktuelleArrFeil },
  ] = await Promise.all([
    supabase
      .from('kaaringmaler')
      .select('id, navn, kandidat_kilde, rekkefolge')
      .order('rekkefolge'),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('aktiv', true),
    supabase
      .from('arrangementer')
      .select('id')
      .eq('type', 'moete')
      .gte('start_tidspunkt', `${aar}-01-01T00:00:00Z`)
      .lt('start_tidspunkt', `${aar + 1}-01-01T00:00:00Z`),
    supabase
      .from('arrangementer')
      .select('id, tittel, start_tidspunkt')
      .gte('start_tidspunkt', tidligsteArrIso)
      .order('start_tidspunkt', { ascending: false }),
  ])
  // Skjemaet under styrer hvilke maler/arrangementer en kåringspoll kan
  // opprettes for — samme "kast heller enn å gjette"-resonnement som
  // brukteMaler-oppslaget under.
  if (malerFeil) throw new Error(`Kunne ikke hente kåringmaler: ${malerFeil.message}`)
  if (medlemAntallFeil) throw new Error(`Kunne ikke telle medlemmer: ${medlemAntallFeil.message}`)
  if (aaretsMoeterFeil) throw new Error(`Kunne ikke hente årets møter: ${aaretsMoeterFeil.message}`)
  if (aktuelleArrFeil) throw new Error(`Kunne ikke hente arrangementer: ${aktuelleArrFeil.message}`)

  // Fjern maler som allerede har en åpen eller avgjort kåringspoll for året.
  const { data: brukteMaler, error: brukteMalerFeil } = await supabase
    .from('poll')
    .select('kaaring_mal_id')
    .eq('aar', aar)
    .not('kaaring_mal_id', 'is', null)

  // Feiler denne stille, viser skjemaet maler som «ledige» selv om de alt er
  // brukt — det kan gi en duplikat kåringspoll. Kast heller enn å gjette.
  if (brukteMalerFeil) throw new Error(`Kunne ikke hente brukte kåringsmaler: ${brukteMalerFeil.message}`)

  const tatt = new Set((brukteMaler ?? []).map(b => b.kaaring_mal_id))
  const tilgjengelige = (maler ?? []).filter(m => !tatt.has(m.id))

  return (
    <OpprettSkjema
      maler={tilgjengelige}
      defaultAar={aar}
      medlemAntall={medlemAntall ?? 0}
      moeteAntall={(aaretsMoeter ?? []).length}
      arrangementer={aktuelleArr ?? []}
    />
  )
}
