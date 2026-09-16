import { createServerClient } from '@/lib/supabase/server'
import { getInnloggetBruker, getProfil } from '@/lib/auth-cache'
import { kanAdministrere } from '@/lib/roller'
import { hentAppFlagg, CHAT_FANE } from '@/lib/app-innstillinger'
import { KLUBB_KART_SENTER } from '@/lib/klubb-config'
import { finnPaagaaendeArrangement } from '@/lib/posisjon'
import { POSISJON_SPOR_TIMER } from '@/lib/konstanter'
import PosisjonsKart, { type Mann, type Markering, type Punkt } from '@/components/kart/PosisjonsKart'
import { logg } from '@/lib/logg'

// Kartet skal alltid vise hvor gutta ER, ikke hvor de var da siden sist ble
// bygget. force-dynamic er derfor ikke en optimalisering vi har glemt — det er
// hele poenget med sida.
export const dynamic = 'force-dynamic'

// «Kart» — hvor de som deler posisjon befinner seg, og hvor de har vært i løpet
// av et pågående arrangement (#693, spor i #695).
//
// RLS skjuler allerede punkter fra menn uten aktiv deling, så spørringen under
// trenger ikke filtrere på det selv. Ett unntak håndteres her: policyen slipper
// gjennom DINE EGNE punkter også når din deling er utløpt, slik at appen kan
// skille «du deler ikke» fra «delingen din gikk ut».
export default async function Kart() {
  const [supabase, bruker, profil] = await Promise.all([
    createServerClient(),
    getInnloggetBruker(),
    getProfil(),
  ])

  const [
    { data: delinger, error: delingFeil },
    { data: punkter, error: punktFeil },
    { data: markeringRader, error: markeringFeil },
    paagaaende,
  ] = await Promise.all([
    supabase
      .from('posisjon_deling')
      .select('profil_id, deler_til, profiles!posisjon_deling_profil_id_fkey ( navn, visningsnavn, bilde_url, rolle )'),
    supabase
      .from('posisjon_punkt')
      .select('id, profil_id, lat, lng, noeyaktighet_m, registrert, arrangement_id')
      .order('registrert', { ascending: true }),
    supabase
      .from('kart_markering')
      .select('id, lat, lng, tekst, symbol, opprettet, utloper, opprettet_av, profiles!kart_markering_opprettet_av_fkey ( navn, visningsnavn )')
      .order('opprettet', { ascending: false }),
    finnPaagaaendeArrangement(supabase),
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
  ] = await Promise.all([
    supabase
      .from('klubb_chat')
      .select('id, profil_id, innhold, bilde_url, video_url, opprettet, fra_facebook')
      .order('opprettet', { ascending: false })
      .limit(30),
    supabase.from('profiles').select('id, navn, bilde_url, rolle').eq('aktiv', true),
    hentAppFlagg(supabase, CHAT_FANE, true),
  ])

  // Chatten er et TILLEGG på denne siden, ikke grunnen til at man er her. En
  // feilet spørring skal derfor ikke ta ned kartet — panelet står bare tomt.
  // Motsatt av /chat, der samme feil med rette kaster.
  if (chatFeil) logg.warn('kart.chat.hent.feilet', { code: chatFeil.code })
  if (chatProfilFeil) logg.warn('kart.chat.profiler.feilet', { code: chatProfilFeil.code })

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

  const naaMs = Date.now()
  const megId = bruker!.id

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
  const relevante = ((punkter ?? []) as PunktRad[]).filter(p => {
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
      arrangementTittel={paagaaende?.tittel ?? null}
      // Admin kan fjerne andres markeringer. RLS har tillatt det siden
      // migrasjon 145; fram til nå skjulte UI-et muligheten, slik at
      // policyen og skjermen sa to forskjellige ting.
      erAdmin={kanAdministrere(profil?.rolle)}
      // Samme gating som /chat: av når admin har skrudd den av, men admin selv
      // beholder tilgang. Uten dette ville kartet vært en vei rundt bryteren.
      visChat={kanAdministrere(profil?.rolle) || chatFane}
      chatMeldinger={[...(chatMeldinger ?? [])].reverse()}
      chatProfiler={chatProfiler ?? []}
    />
  )
}
