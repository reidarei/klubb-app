import { createServerClient } from '@/lib/supabase/server'
import { getInnloggetBruker, getProfil } from '@/lib/auth-cache'
import { kanAdministrere } from '@/lib/roller'
import { hentAppFlagg, CHAT_FANE } from '@/lib/app-innstillinger'
import { KLUBB_KART_SENTER } from '@/lib/klubb-config'
import { finnPaagaaendeArrangement } from '@/lib/posisjon'
import { finnAktuellArrangement } from '@/lib/timeplan'
import { hentKartmodus } from '@/lib/kartmodus'
import { POSISJON_SPOR_TIMER, POSISJON_PUNKT_MAKS } from '@/lib/konstanter'
import { parseStedParam } from '@/lib/kart-lenke'
import { beregnPingKandidater } from '@/lib/kart-deltakere'
import PosisjonsKart, {
  type Mann,
  type Markering,
  type Punkt,
  type TimeplanArrangement,
  type TimeplanPost,
} from '@/components/kart/PosisjonsKart'
import { logg } from '@/lib/logg'

// Kartet skal alltid vise hvor gutta ER, ikke hvor de var da siden sist ble
// bygget. force-dynamic er derfor ikke en optimalisering vi har glemt — det er
// hele poenget med sida.
export const dynamic = 'force-dynamic'

// «Nil UUID» — finnes aldri som en ekte rad-id. Brukt til å scope
// timeplan_post-spørringen (#716) til «ingenting» når det ikke er noe
// aktuelt arrangement, i stedet for en betinget Promise-gren. Se wave 2
// under.
const TIMEPLAN_INGEN_ARRANGEMENT = '00000000-0000-0000-0000-000000000000'

// Samme triks som over, for påmeldinger-spørringen «Ping en herre» bruker
// (#725): scoper til «ingenting» når det ikke er noe pågående arrangement,
// i stedet for en betinget Promise-gren.
const KART_DELTAKERE_INGEN_ARRANGEMENT = '00000000-0000-0000-0000-000000000000'

// «Kart» — hvor de som deler posisjon befinner seg, og hvor de har vært i løpet
// av et pågående arrangement (#693, spor i #695).
//
// RLS skjuler allerede punkter fra menn uten aktiv deling, så spørringen under
// trenger ikke filtrere på det selv. Ett unntak håndteres her: policyen slipper
// gjennom DINE EGNE punkter også når din deling er utløpt, slik at appen kan
// skille «du deler ikke» fra «delingen din gikk ut».
type Props = {
  // Delt stedslenke (#719): ?lat=&lng=&tekst= — serverside-parsing, ikke
  // useSearchParams() på klienten, samme mønster som arrangementer/ny.
  searchParams: Promise<{ lat?: string; lng?: string; tekst?: string }>
}

export default async function Kart({ searchParams }: Props) {
  // hentKartmodus() er cache()-wrappet (React cache) og lager sin egen
  // klient internt — samme instans som AppLayout allerede kalte i denne
  // requesten, så dette blir ÉN spørring, ikke to (#723/#780).
  const [supabase, bruker, profil, sp, kartmodus] = await Promise.all([
    createServerClient(),
    getInnloggetBruker(),
    getProfil(),
    searchParams,
    hentKartmodus(),
  ])
  const deltSted = parseStedParam(sp)

  const [
    { data: delinger, error: delingFeil },
    { data: punkter, error: punktFeil },
    { data: markeringRader, error: markeringFeil },
    paagaaende,
    aktueltArrangement,
  ] = await Promise.all([
    supabase
      .from('posisjon_deling')
      .select('profil_id, deler_til, profiles!posisjon_deling_profil_id_fkey ( navn, visningsnavn, bilde_url, rolle )'),
    // SYNKENDE + limit, ikke stigende uten grense (#717). PostgREST kapper på
    // max_rows (1000) uansett, og gjør det stille: med stigende sortering er
    // det da de ELDSTE punktene som overlever, mens koden under leser siste
    // element som «ferskest». Resultatet ville vært et kart der alle står
    // frosset på gamle posisjoner, uten feil noe sted. Rekkefølgen snus i JS
    // rett under, så resten av siden ser stigende rekkefølge som før.
    supabase
      .from('posisjon_punkt')
      .select('id, profil_id, lat, lng, noeyaktighet_m, registrert, arrangement_id')
      .order('registrert', { ascending: false })
      .limit(POSISJON_PUNKT_MAKS),
    supabase
      .from('kart_markering')
      .select('id, lat, lng, tekst, symbol, opprettet, utloper, opprettet_av, profiles!kart_markering_opprettet_av_fkey ( navn, visningsnavn )')
      .order('opprettet', { ascending: false }),
    finnPaagaaendeArrangement(supabase),
    // Timeplan-knappens arrangement (#716) — femte parallelle i samme bølge,
    // ikke en tredje bølge. Fail CLOSED: finnAktuellArrangement() kaster ved
    // spørringsfeil i stedet for å returnere null, så en feilet spørring
    // aldri leses som «ingen aktuelt arrangement» (se lib/timeplan.ts).
    finnAktuellArrangement(supabase),
  ])

  // Klubbchatten i venstrepanelet (#709). Hentes her og ikke i komponenten:
  // 30 meldinger er noen få kB serialisert, mens SELVE chat-komponenten er
  // stor — den lastes derfor lazy i PosisjonsKart, først når panelet åpnes.
  // Da betaler man JS-kostnaden bare hvis man faktisk bruker chatten, og
  // kartet er like raskt som før for alle andre (jf. ytelseskravet).
  const [
    { data: chatMeldinger, error: chatFeil },
    { data: chatProfiler, error: chatProfilFeil },
    chatFane,
    { data: timeplanRader, error: timeplanHentFeil },
    { data: paameldingRader, error: paameldingFeil },
  ] = await Promise.all([
    supabase
      .from('klubb_chat')
      .select('id, profil_id, innhold, bilde_url, video_url, opprettet, fra_facebook')
      .order('opprettet', { ascending: false })
      .limit(30),
    supabase.from('profiles').select('id, navn, bilde_url, rolle').eq('aktiv', true),
    hentAppFlagg(supabase, CHAT_FANE, true),
    // Fjerde parallelle i bølge 2 (#716) — ikke en tredje bølge. Scopet til
    // en UUID som garantert ikke finnes når det ikke er noe aktuelt
    // arrangement, i stedet for en betinget Promise.resolve(): uniform
    // spørringsform holder Promise.all-ens typeinferens enkel, og kostnaden
    // er ett billig, indeksert 0-rader-oppslag.
    supabase
      .from('timeplan_post')
      .select(
        'id, tidspunkt, tekst, lat, lng, adresse, opprettet, opprettet_av, profiles!timeplan_post_opprettet_av_fkey ( navn, visningsnavn, bilde_url, rolle )',
      )
      .eq('arrangement_id', aktueltArrangement?.id ?? TIMEPLAN_INGEN_ARRANGEMENT)
      // Stabil sekundærsortering (migrasjon 147, #716-planlegging).
      .order('tidspunkt', { ascending: true })
      .order('opprettet', { ascending: true })
      .order('id', { ascending: true }),
    // Femte parallelle i bølge 2 (#725) — «Ping en herre»-kandidatene. Kun
    // status 'ja' hentes; scopet til KART_DELTAKERE_INGEN_ARRANGEMENT når
    // ingen arrangement pågår (samme triks som timeplan_post-spørringen
    // over). paagaaende er fra bølge 1 (finnPaagaaendeArrangement — IKKE
    // finnAktuellArrangement, som ville falt tilbake på nærmeste FRAMTIDIGE
    // arrangement uansett hvor langt fram, og gitt julebord-påmeldte en
    // pling-liste midt i september).
    supabase
      .from('paameldinger')
      .select('profil_id, status')
      .eq('arrangement_id', paagaaende?.id ?? KART_DELTAKERE_INGEN_ARRANGEMENT)
      .eq('status', 'ja'),
  ])

  // Chatten er et TILLEGG på denne siden, ikke grunnen til at man er her. En
  // feilet spørring skal derfor ikke ta ned kartet — panelet står bare tomt.
  // Motsatt av /chat, der samme feil med rette kaster.
  if (chatFeil) logg.warn('kart.chat.hent.feilet', { code: chatFeil.code })
  if (chatProfilFeil) logg.warn('kart.chat.profiler.feilet', { code: chatProfilFeil.code })

  // «Ping en herre» er et TILLEGG i listepanelet, ikke grunnen til at man er
  // på kartet — en feilet spørring skal ikke ta ned siden, bare gi en tom
  // (eller ufullstendig) kandidatliste.
  if (paameldingFeil) logg.warn('kart.deltakere.paameldinger.feilet', { code: paameldingFeil.code })

  // Timeplanen er også et TILLEGG — kartet skal ikke tas ned av en feilet
  // post-spørring. Men i motsetning til chatten skal panelet ALDRI vise en
  // tom liste ved feil (det ville lest som «ingen har lagt inn noe»);
  // timeplanFeil-flagget under gir TimeplanPanel sin egen, synlige
  // feiltilstand.
  if (timeplanHentFeil) logg.warn('kart.timeplan.hent.feilet', { code: timeplanHentFeil.code })

  // Kaster i stedet for å rendre et tomt kart: «ingen deler» og «spørringen
  // feilet» ser identiske ut for brukeren, og et kart som lyver om at ingen er
  // ute er verre enn en feilside (jf. Policy: Databasespørringer).
  if (delingFeil) throw new Error(`Kunne ikke hente delinger: ${delingFeil.message}`)
  if (punktFeil) throw new Error(`Kunne ikke hente posisjoner: ${punktFeil.message}`)
  if (markeringFeil) throw new Error(`Kunne ikke hente markeringer: ${markeringFeil.message}`)

  type RawProfil = {
    navn: string
    visningsnavn: string | null
    bilde_url: string | null
    rolle: string | null
  }
  type DelingRad = {
    profil_id: string
    deler_til: string
    profiles: RawProfil | RawProfil[] | null
  }
  type PunktRad = {
    id: string
    profil_id: string
    lat: number
    lng: number
    noeyaktighet_m: number | null
    registrert: string
    arrangement_id: string | null
  }

  type MarkeringRad = {
    id: string
    lat: number
    lng: number
    tekst: string
    symbol: string
    opprettet: string
    utloper: string
    opprettet_av: string
    profiles: { navn: string; visningsnavn: string | null } | { navn: string; visningsnavn: string | null }[] | null
  }

  type TimeplanPostRad = {
    id: string
    tidspunkt: string
    tekst: string
    lat: number | null
    lng: number | null
    adresse: string | null
    opprettet: string
    opprettet_av: string
    profiles: RawProfil | RawProfil[] | null
  }

  const naaMs = Date.now()
  const megId = bruker!.id

  // Arrangementet timeplan-pilla peker til, i klient-formen (#716). null
  // betyr «ingen aktuelt arrangement» — pilla rendres da ikke i det hele tatt.
  const timeplanArrangement: TimeplanArrangement | null = aktueltArrangement
    ? {
        id: aktueltArrangement.id,
        tittel: aktueltArrangement.tittel,
        startTidspunkt: aktueltArrangement.startTidspunkt,
        sluttTidspunkt: aktueltArrangement.sluttTidspunkt,
        blaatur: aktueltArrangement.destinasjonSensurert,
      }
    : null

  const timeplanPoster: TimeplanPost[] = ((timeplanRader ?? []) as TimeplanPostRad[]).map(t => {
    const pr = Array.isArray(t.profiles) ? t.profiles[0] : t.profiles
    return {
      id: t.id,
      tidspunkt: t.tidspunkt,
      tekst: t.tekst,
      lat: t.lat,
      lng: t.lng,
      adresse: t.adresse,
      opprettet: t.opprettet,
      opprettetAv: t.opprettet_av,
      opprettetAvNavn: pr?.visningsnavn || pr?.navn || 'Ukjent',
      opprettetAvBildeUrl: pr?.bilde_url ?? null,
      opprettetAvRolle: pr?.rolle ?? null,
      erMin: t.opprettet_av === megId,
    }
  })

  // Utløpte markeringer kommer med fra RLS for den som satte dem (samme unntak
  // som egen posisjonsrad). De skal ikke tegnes — cron rydder dem, men kartet
  // skal ikke vise dem i mellomtiden som om de fortsatt gjaldt.
  const markeringer: Markering[] = ((markeringRader ?? []) as MarkeringRad[])
    .filter(m => new Date(m.utloper).getTime() > naaMs)
    .map(m => {
      const pr = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
      return {
        id: m.id,
        lat: m.lat,
        lng: m.lng,
        tekst: m.tekst,
        symbol: m.symbol,
        opprettet: m.opprettet,
        avNavn: pr?.visningsnavn || pr?.navn || 'Ukjent',
        erMin: m.opprettet_av === bruker!.id,
      }
    })

  // Kun aktive delinger tegnes. Egen utløpte rad kommer med fra RLS (se over) og
  // skal ikke stå igjen på kartet som om du fortsatt var der.
  const aktive = ((delinger ?? []) as DelingRad[]).filter(
    d => new Date(d.deler_til).getTime() > naaMs,
  )
  const aktiveIder = new Set(aktive.map(d => d.profil_id))

  // Sporet vises ALLTID, ikke bare under et arrangement (#698). Det som
  // varierer er hva som avgrenser det:
  //
  //   pågår et arrangement  → punktene fra DET arrangementet, uansett alder.
  //                           En tur over flere dager skal vises i sin helhet.
  //   ellers                → punktene fra siste POSISJON_SPOR_TIMER, altså
  //                           «hvor har vi vært i dag».
  //
  // Fram til #698 ble sporet klippet til ett punkt utenom arrangementer. Da så
  // det ut som appen ikke lagret noe — men punktene lå der hele tiden, det var
  // bare visningen som skjulte dem.
  const sporGrense = Date.now() - POSISJON_SPOR_TIMER * 60 * 60 * 1000
  // Spørringen henter synkende (nyeste først) for å overleve max_rows-
  // avkortingen; resten av siden forventer stigende, så vi snur her.
  const punkterStigende = [...((punkter ?? []) as PunktRad[])].reverse()
  const relevante = punkterStigende.filter(p => {
    if (!aktiveIder.has(p.profil_id)) return false
    if (paagaaende) return p.arrangement_id === paagaaende.id
    return new Date(p.registrert).getTime() > sporGrense
  })

  const menn: Mann[] = aktive
    .map(d => {
      const pr = Array.isArray(d.profiles) ? d.profiles[0] : d.profiles
      // Stigende rekkefølge fra spørringen, så siste element er ferskest.
      const mine = relevante.filter(p => p.profil_id === d.profil_id)
      const siste = mine[mine.length - 1]
      if (!siste) return null
      return {
        profilId: d.profil_id,
        navn: pr?.visningsnavn || pr?.navn || 'Ukjent',
        bildeUrl: pr?.bilde_url ?? null,
        rolle: pr?.rolle ?? null,
        delerTil: d.deler_til,
        spor: mine.map(
          (p): Punkt => ({
            id: p.id,
            lat: p.lat,
            lng: p.lng,
            noeyaktighetM: p.noeyaktighet_m,
            registrert: p.registrert,
          }),
        ),
      }
    })
    .filter((m): m is Mann => m !== null)

  // «Ping en herre» (#725) — kandidatene som IKKE allerede deler posisjon.
  // Gjenbruker chatProfiler (allerede «alle aktive medlemmer») i stedet for
  // en sjette spørring.
  const pingKandidater = beregnPingKandidater(
    chatProfiler ?? [],
    paameldingRader ?? [],
    paagaaende?.id ?? null,
    aktiveIder,
  )

  return (
    <PosisjonsKart
      menn={menn}
      markeringer={markeringer}
      // Non-null: (app)-ruter ligger bak auth-guarden i middleware.ts, så en
      // uinnlogget bruker når aldri denne render-en. Samme antakelse som
      // /arrangoransvar og /chat gjør.
      megId={megId}
      fallbackSenter={KLUBB_KART_SENTER}
      // Sier om et ARRANGEMENT rammer inn sporet — ikke om spor vises i det
      // hele tatt, som det nå alltid gjør. Styrer kun teksten om hvor lenge
      // ruta lever.
      underArrangement={paagaaende !== null}
      // Admin kan fjerne andres markeringer. RLS har tillatt det siden
      // migrasjon 145; fram til nå skjulte UI-et muligheten, slik at
      // policyen og skjermen sa to forskjellige ting.
      erAdmin={kanAdministrere(profil?.rolle)}
      // Samme gating som /chat: av når admin har skrudd den av, men admin selv
      // beholder tilgang. Uten dette ville kartet vært en vei rundt bryteren.
      visChat={kanAdministrere(profil?.rolle) || chatFane}
      chatMeldinger={[...(chatMeldinger ?? [])].reverse()}
      chatProfiler={chatProfiler ?? []}
      timeplanArrangement={timeplanArrangement}
      timeplanPoster={timeplanPoster}
      timeplanFeil={timeplanHentFeil !== null}
      deltSted={deltSted}
      pingKandidater={pingKandidater}
      reisemodus={kartmodus.paa}
      kartmodus={kartmodus.modus}
    />
  )
}
