import { test, expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { harTestCreds } from './helpers/auth'
import { adminKlient } from './helpers/admin-klient'
import { nullstillKaaringSeedPoller, KAARING_SEED_POLL_ID } from './helpers/rydd-kaaring-seed'
import { stempleVinnerVarslet } from '../lib/varsler-kaaringspoll'
import type { Database } from '../lib/supabase/database.types'

// Retry-stien for kåringsvarselet (#495/#504/#521) har aldri kjørt mot en ekte
// database — prod har 0 avsluttede kåringspoller, og enhetstestene kjører kun
// mot en Supabase-mock (#520). Denne speccen kjører den EKTE cronen
// (/api/cron/paaminne) mot fire faste fixtures i supabase/seed.sql
// (prefiks 9700, se den fila for hvorfor nøyaktig disse fire) og verifiserer
// DB-tilstanden direkte etterpå — IKKE at push/epost faktisk gikk ut.
//
// Varsler-vakten (BLOKKER_UTSENDING i lib/varsler.ts) er urørt: dev-serveren
// for e2e kjører med NEXT_PUBLIC_BASE_URL=http://localhost:3100 og
// ALLOW_LOCAL_NOTIFICATIONS=false (playwright.config.ts), så all faktisk
// push/epost-utsending er blokkert uansett hva denne speccen gjør (se
// e2e/README.md § Sikkerhetsmodellen).
//
// #512 (verifisér også URL-/kanal-normaliseringen ved å sette
// ALLOW_LOCAL_NOTIFICATIONS=true for dev-server-barnet) er bevisst IKKE gjort.
// Grunnen er ikke hvilke Supabase-credentials prosessen har — det er at
// flagget er det eneste som står mellom sendVarsel() og ekte
// sendEpostBatch()/sendPush(), og dev-serveren arver RESEND_API_KEY og
// VAPID_PRIVATE_KEY fra .env.local. De nøklene er PROD-nøkler. Flagget
// skiller altså ikke «blokkér ekte utsending» fra «hopp over resten av
// funksjonen», så å skru det på for å nå normaliseringskoden ville samtidig
// sendt ekte e-post til ekte medlemmer. Skal #512 løses, må vakten splittes
// i to (tørrkjør vs. blokkér) — ikke skrus av.
test.describe('kåringsvarsel-retry mot ekte cron (#520)', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md og docs/test-instans.md')
  test.skip(!process.env.CRON_SECRET, 'CRON_SECRET mangler i .env.local')

  test.beforeEach(nullstillKaaringSeedPoller)
  test.afterEach(nullstillKaaringSeedPoller)

  // Seed-blokken kobler fixturene til kåringsmalen via
  // `(select id from kaaringmaler where navn = 'Årets herre')`. Mangler malen
  // (feilstavet navn, endret mal-seed, ufullstendig `db reset`) gir det NULL
  // uten å feile — og cron-spørringene filtrerer på
  // `.not('kaaring_mal_id','is',null)`, så alle fire faller ut av køen og
  // hele speccen blir grønn på tom luft. Vi kan ikke kjøre `db reset` herfra
  // (SSH-nøkkelen er passordbeskyttet, ingen tty), så den stille feilmoden
  // gjøres høylytt her i stedet: neste reset sier fra selv.
  test.beforeEach(async () => {
    const supabase = adminKlient('kaaring-varsel-retry-preflight')
    if (!supabase) return
    const { data, error } = await supabase
      .from('poll')
      .select('id, kaaring_mal_id')
      .in('id', Object.values(KAARING_SEED_POLL_ID))
    if (error) throw new Error(`Kunne ikke lese kåringsfixturene: ${error.message}`)
    const funnet = data ?? []
    expect(
      funnet.length,
      'Fant ikke alle fire kåringsfixturene (prefiks 9700) i test-instansen — kjør `supabase db reset`, se docs/test-instans.md',
    ).toBe(Object.keys(KAARING_SEED_POLL_ID).length)
    const utenMal = funnet.filter(p => p.kaaring_mal_id == null).map(p => p.id)
    expect(
      utenMal,
      'Kåringsfixtures uten kaaring_mal_id: seed.sql sitt `select id from kaaringmaler where navn = \'Årets herre\'` ga NULL, og cronen filtrerer dem bort — testen ville blitt grønn uten å teste noe',
    ).toEqual([])
  })

  // Bursdagsgrenen kjører på ALLE slots, også slot 1. Treffer kjøredagen en
  // av seedens fødselsdatoer (15.03, 20.07, 05.11) inserter cronen en ekte
  // klubb_chat-post som ingen annen opprydning fanger. Usynlig 362 dager i
  // året — derfor ryddes den her, ikke «ved behov».
  test.afterEach(async () => {
    const supabase = adminKlient('kaaring-varsel-retry-bursdagsrydd')
    if (!supabase) return
    const { error } = await supabase.from('klubb_chat').delete().like('kilde_ekstern_id', 'bursdag:%')
    if (error) console.error('[kaaring-varsel-retry] rydding av bursdagsposter feilet:', error)
  })

  test('fersk poll lukkes, umarkert avsluttet poll varsles, markert/gammel poll rører seg ikke', async ({
    request,
  }) => {
    const supabase = adminKlient('kaaring-varsel-retry-spec')
    if (!supabase) throw new Error('E2E_SUPABASE_* mangler — se docs/test-instans.md')

    // Fang «før»-tilstanden for den allerede varslede pollen — vi beviser at
    // retry-spørringen IKKE rører den ved å sjekke at stemplet er UENDRET
    // (ikke bare «fortsatt satt», som også ville vært sant hvis cronen hadde
    // stemplet den PÅ NYTT med et ferskt tidspunkt).
    const { data: markertFoer, error: markertFoerFeil } = await supabase
      .from('poll')
      .select('vinner_varslet_paa')
      .eq('id', KAARING_SEED_POLL_ID.AVSLUTTET_MARKERT)
      .single()
    if (markertFoerFeil) throw new Error(`Kunne ikke lese før-tilstand: ${markertFoerFeil.message}`)

    const svar = await request.post(`/api/cron/paaminne?slotIndex=1`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    })
    expect(svar.ok(), await svar.text()).toBeTruthy()
    const kropp = await svar.json()
    // FERSK-fixturen skal ha blitt lukket av avslutt_kaaringspoll-RPC-en, og
    // UMARKERT skal ha fått sendt (blokkert, men logisk «sendt») vinnervarsel
    // via retry-grenen — begge teller inn i disse to summene.
    expect(kropp.paaminne.lukketKaaringer).toBeGreaterThanOrEqual(1)
    expect(kropp.paaminne.sendteVarsler).toBeGreaterThanOrEqual(1)

    const { data: rader, error: raderFeil } = await supabase
      .from('poll')
      .select('id, avsluttet_paa, tiebreak_status, vinner_varslet_paa')
      .in('id', Object.values(KAARING_SEED_POLL_ID))
    if (raderFeil) throw new Error(`Kunne ikke lese etter-tilstand: ${raderFeil.message}`)
    const perId = new Map((rader ?? []).map(r => [r.id, r]))

    // FERSK: «fersk»-spørringen (avsluttet_paa is null, svarfrist < nå,
    // vinner_varslet_paa is null) skal ha plukket den opp og kalt RPC-en —
    // uten poll_valg-kandidater gir RPC-en 'ingen_stemmer', som likevel
    // lukker pollen og stempler vinner_varslet_paa (se seed.sql-kommentar).
    const fersk = perId.get(KAARING_SEED_POLL_ID.FERSK)
    expect(fersk?.avsluttet_paa, 'FERSK skulle vært lukket av RPC-en').not.toBeNull()
    expect(fersk?.vinner_varslet_paa, 'FERSK skulle vært stemplet varslet').not.toBeNull()

    // AVSLUTTET_MARKERT: allerede varslet FØR cron-kjøringen — retry-
    // spørringens JS-filter (`vinner_varslet_paa == null`) skal ha utelatt
    // den helt. Stemplet skal derfor være BYTE-IDENTISK med før-verdien, ikke
    // bare «fortsatt satt».
    const markertEtter = perId.get(KAARING_SEED_POLL_ID.AVSLUTTET_MARKERT)
    expect(markertEtter?.vinner_varslet_paa, 'AVSLUTTET_MARKERT skulle IKKE vært rørt').toBe(
      markertFoer?.vinner_varslet_paa,
    )

    // AVSLUTTET_UMARKERT: avsluttet, innenfor retry-vinduet, uten markør —
    // dette ER #520s kjernepåstand: retry-spørringen skal plukke den opp og
    // stemple den.
    const umarkertEtter = perId.get(KAARING_SEED_POLL_ID.AVSLUTTET_UMARKERT)
    expect(umarkertEtter?.vinner_varslet_paa, 'AVSLUTTET_UMARKERT skulle vært plukket opp av retry').not.toBeNull()

    // AVSLUTTET_GAMMEL: avsluttet 10 dager tilbake — UTENFOR
    // KAARING_VARSEL_RETRY_DAGER (7)-vinduet. Skal falle ut av køen og
    // forbli uvarslet, selv om den (som UMARKERT) mangler stempel.
    const gammelEtter = perId.get(KAARING_SEED_POLL_ID.AVSLUTTET_GAMMEL)
    expect(gammelEtter?.vinner_varslet_paa, 'AVSLUTTET_GAMMEL skal falle utenfor retry-vinduet').toBeNull()
  })

  // #520s fjerde punkt, del 1: to samtidige cron-kjøringer skal ikke behandle
  // den samme pollen to ganger.
  test('to samtidige cron-kjøringer lukker FERSK nøyaktig én gang og lar stemplet ligge', async ({
    request,
  }) => {
    const supabase = adminKlient('kaaring-varsel-retry-samtidig')
    if (!supabase) throw new Error('E2E_SUPABASE_* mangler — se docs/test-instans.md')

    const kjor = () =>
      request.post(`/api/cron/paaminne?slotIndex=1`, {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        // Egen, romslig timeout: to parallelle kjøringer i dev-serveren
        // konkurrerer om samme kompilering og DB-tilkoblinger.
        timeout: 60_000,
      })

    const [a, b] = await Promise.all([kjor(), kjor()])
    expect(a.ok(), await a.text()).toBeTruthy()
    expect(b.ok(), await b.text()).toBeTruthy()

    // FERSK er den ENESTE pollen i test-instansen som «fersk»-spørringen kan
    // plukke opp (de historiske 9400-pollene har kaaring_mal_id = null), og
    // avslutt_kaaringspoll-RPC-en er atomisk. Nøyaktig én av de to kjøringene
    // skal derfor rapportere at den lukket den — summen er 1, ikke 2,
    // uansett hvor mye kjøringene overlapper.
    const [kroppA, kroppB] = [await a.json(), await b.json()]
    expect(
      kroppA.paaminne.lukketKaaringer + kroppB.paaminne.lukketKaaringer,
      'FERSK skal være lukket av nøyaktig én av de to samtidige kjøringene',
    ).toBe(1)

    const lesUmarkert = async () => {
      const { data, error } = await supabase
        .from('poll')
        .select('vinner_varslet_paa')
        .eq('id', KAARING_SEED_POLL_ID.AVSLUTTET_UMARKERT)
        .single()
      if (error) throw new Error(`Kunne ikke lese UMARKERT: ${error.message}`)
      return data.vinner_varslet_paa
    }

    const etterParallell = await lesUmarkert()
    expect(etterParallell, 'UMARKERT skulle vært stemplet av (minst) én av kjøringene').not.toBeNull()

    // En TREDJE, sekvensiell kjøring skal ikke røre stemplet. NB: det er
    // JS-filteret i behandleKaaringspoller() (`p.vinner_varslet_paa == null`)
    // som stopper den her, ikke CAS-en — verifisert ved å fjerne CAS-en, som
    // ikke gjorde denne raden rød. CAS-en dekkes av testen under.
    const tredje = await kjor()
    expect(tredje.ok(), await tredje.text()).toBeTruthy()
    expect(
      await lesUmarkert(),
      'UMARKERT skal ikke restemples av en senere kjøring — retry-filteret slipper den ikke gjennom',
    ).toBe(etterParallell)
  })

  // #520s fjerde punkt, del 2: selve CAS-en.
  //
  // Denne kalles direkte i stedet for via HTTP, og det er et bevisst valg:
  // CAS-ens eneste observerbare effekt er at ET ALLEREDE SATT stempel ikke
  // flyttes. Går man via cronen, blir raden filtrert bort av JS-filteret over
  // FØR den når CAS-en, så en fjernet CAS gir grønn test likevel (prøvd —
  // suiten forble grønn med `.is('vinner_varslet_paa', null)` fjernet). Vi
  // må altså kalle stempelfunksjonen med en poll som ALT er stemplet, og det
  // kan bare gjøres ved å kalle den direkte.
  //
  // Enhetstestene kan ikke dekke dette: Supabase-mocken i
  // __tests__/helpers/supabase-mock.ts har ingen ekte WHERE på update, så
  // `.is(...)`-leddet er en no-op der. Det er nettopp derfor #520 ba om det
  // her. At testprosessen kan snakke med en ekte Postgres uten å risikere
  // prod, skyldes env-pinningen i playwright.config.ts.
  test('stempleVinnerVarslet flytter ikke et allerede satt stempel (CAS mot ekte Postgres)', async () => {
    const supabase = adminKlient('kaaring-varsel-retry-cas')
    if (!supabase) throw new Error('E2E_SUPABASE_* mangler — se docs/test-instans.md')
    // adminKlient gir en utypet SupabaseClient; stempelfunksjonen krever den
    // genererte Database-typen. Samme klient, kun typenivå.
    const admin = supabase as unknown as SupabaseClient<Database>

    const les = async () => {
      const { data, error } = await supabase
        .from('poll')
        .select('vinner_varslet_paa')
        .eq('id', KAARING_SEED_POLL_ID.AVSLUTTET_UMARKERT)
        .single()
      if (error) throw new Error(`Kunne ikke lese UMARKERT: ${error.message}`)
      return data.vinner_varslet_paa as string | null
    }

    // beforeEach har nullstilt stemplet, så første kall er det som «vinner».
    expect(await les(), 'beforeEach skulle latt UMARKERT stå uten stempel').toBeNull()
    await stempleVinnerVarslet(admin, KAARING_SEED_POLL_ID.AVSLUTTET_UMARKERT)
    const foerste = await les()
    expect(foerste, 'første stempling skal sette verdien').not.toBeNull()

    // Vent litt så naa() garantert gir et ANNET tidsstempel enn det første.
    // Uten pausen kunne to kall innenfor samme millisekund gitt identisk
    // verdi, og testen ville vært grønn selv med CAS-en fjernet.
    await new Promise(r => setTimeout(r, 50))

    await stempleVinnerVarslet(admin, KAARING_SEED_POLL_ID.AVSLUTTET_UMARKERT)
    expect(
      await les(),
      'CAS-en (`.is(\'vinner_varslet_paa\', null)`) skal gjøre andre stempling til en no-op — ellers glir markøren fremover ved hver overlappende kjøring og retry-vinduet lukker seg aldri',
    ).toBe(foerste)
  })
})
