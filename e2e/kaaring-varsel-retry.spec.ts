import { test, expect } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { harTestCreds } from './helpers/auth'
import { adminKlient } from './helpers/admin-klient'
import { nullstillKaaringSeedPoller, KAARING_SEED_POLL_ID } from './helpers/rydd-kaaring-seed'
import { stempleVinnerVarslet } from '../lib/varsler-kaaringspoll'
import type { Database } from '../lib/supabase/database.types'

// Kjører den EKTE cronen (/api/cron/paaminne) mot fire fixtures i seed.sql
// (prefiks 9700) og verifiserer DB-tilstanden etterpå — ikke at push/epost gikk
// ut. Retry-stien (#495/#504/#521) er ellers kun testet mot mock (#520).
//
// Utsending er blokkert av BLOKKER_UTSENDING (lokal BASE_URL,
// ALLOW_LOCAL_NOTIFICATIONS=false — se e2e/README.md § Sikkerhetsmodellen).
//
// #512 er bevisst IKKE gjort: ALLOW_LOCAL_NOTIFICATIONS=true ville nådd
// normaliseringskoden, men serveren arver PROD-nøkler (RESEND_API_KEY,
// VAPID_PRIVATE_KEY) fra .env.local og ville sendt ekte varsler. Krever at
// vakten splittes i tørrkjør vs. blokkér — ikke at den skrus av.
test.describe('kåringsvarsel-retry mot ekte cron (#520)', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md og docs/test-instans.md')
  test.skip(!process.env.CRON_SECRET, 'CRON_SECRET mangler i .env.local')

  test.beforeEach(nullstillKaaringSeedPoller)
  test.afterEach(nullstillKaaringSeedPoller)

  // Preflight: seeden slår opp kåringsmalen på navn. Mangler den, blir
  // kaaring_mal_id stille NULL, cronen filtrerer bort alle fire, og speccen
  // blir grønn på tom luft.
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

  // Bursdagsgrenen kjører på alle slots: treffer kjøredagen en seedet
  // fødselsdato (15.03, 20.07, 05.11), lages en klubb_chat-post ingen andre rydder.
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

    // Før-verdien trengs for å bevise at stemplet er UENDRET, ikke bare
    // «fortsatt satt» (som også stemmer ved restempling).
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
    // FERSK lukkes av RPC-en og UMARKERT får (blokkert, men logisk «sendt»)
    // vinnervarsel via retry — begge teller her.
    expect(kropp.paaminne.lukketKaaringer).toBeGreaterThanOrEqual(1)
    expect(kropp.paaminne.sendteVarsler).toBeGreaterThanOrEqual(1)

    const { data: rader, error: raderFeil } = await supabase
      .from('poll')
      .select('id, avsluttet_paa, tiebreak_status, vinner_varslet_paa')
      .in('id', Object.values(KAARING_SEED_POLL_ID))
    if (raderFeil) throw new Error(`Kunne ikke lese etter-tilstand: ${raderFeil.message}`)
    const perId = new Map((rader ?? []).map(r => [r.id, r]))

    // FERSK: uten poll_valg gir RPC-en 'ingen_stemmer', som likevel lukker og
    // stempler (se seed.sql).
    const fersk = perId.get(KAARING_SEED_POLL_ID.FERSK)
    expect(fersk?.avsluttet_paa, 'FERSK skulle vært lukket av RPC-en').not.toBeNull()
    expect(fersk?.vinner_varslet_paa, 'FERSK skulle vært stemplet varslet').not.toBeNull()

    const markertEtter = perId.get(KAARING_SEED_POLL_ID.AVSLUTTET_MARKERT)
    expect(markertEtter?.vinner_varslet_paa, 'AVSLUTTET_MARKERT skulle IKKE vært rørt').toBe(
      markertFoer?.vinner_varslet_paa,
    )

    // Kjernepåstanden i #520: avsluttet, innenfor vinduet, uten markør → plukkes opp.
    const umarkertEtter = perId.get(KAARING_SEED_POLL_ID.AVSLUTTET_UMARKERT)
    expect(umarkertEtter?.vinner_varslet_paa, 'AVSLUTTET_UMARKERT skulle vært plukket opp av retry').not.toBeNull()

    // Avsluttet for 10 dager siden — utenfor KAARING_VARSEL_RETRY_DAGER (7).
    const gammelEtter = perId.get(KAARING_SEED_POLL_ID.AVSLUTTET_GAMMEL)
    expect(gammelEtter?.vinner_varslet_paa, 'AVSLUTTET_GAMMEL skal falle utenfor retry-vinduet').toBeNull()
  })

  // To samtidige cron-kjøringer skal ikke behandle samme poll to ganger (#520).
  test('to samtidige cron-kjøringer lukker FERSK nøyaktig én gang og lar stemplet ligge', async ({
    request,
  }) => {
    const supabase = adminKlient('kaaring-varsel-retry-samtidig')
    if (!supabase) throw new Error('E2E_SUPABASE_* mangler — se docs/test-instans.md')

    const kjor = () =>
      request.post(`/api/cron/paaminne?slotIndex=1`, {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        // Romslig: to parallelle kjøringer konkurrerer om kompilering og DB-tilkoblinger.
        timeout: 60_000,
      })

    const [a, b] = await Promise.all([kjor(), kjor()])
    expect(a.ok(), await a.text()).toBeTruthy()
    expect(b.ok(), await b.text()).toBeTruthy()

    // FERSK er eneste poll «fersk»-spørringen kan plukke (9400-pollene har
    // kaaring_mal_id = null), og RPC-en er atomisk — summen skal være 1.
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

    // NB: det er JS-filteret i behandleKaaringspoller() som stopper en tredje
    // kjøring her, ikke CAS-en. CAS-en dekkes av testen under.
    const tredje = await kjor()
    expect(tredje.ok(), await tredje.text()).toBeTruthy()
    expect(
      await lesUmarkert(),
      'UMARKERT skal ikke restemples av en senere kjøring — retry-filteret slipper den ikke gjennom',
    ).toBe(etterParallell)
  })

  // Selve CAS-en (#520). Kalles direkte, ikke via HTTP: via cronen filtrerer
  // JS-filteret bort en stemplet rad før den når CAS-en, så en fjernet CAS
  // ville gitt grønn test. Kan ikke enhetstestes: Supabase-mocken har ingen
  // ekte WHERE på update, så `.is(...)` er en no-op der.
  test('stempleVinnerVarslet flytter ikke et allerede satt stempel (CAS mot ekte Postgres)', async () => {
    const supabase = adminKlient('kaaring-varsel-retry-cas')
    if (!supabase) throw new Error('E2E_SUPABASE_* mangler — se docs/test-instans.md')
    // Kun typenivå: adminKlient er utypet, stempelfunksjonen krever Database-typen.
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

    expect(await les(), 'beforeEach skulle latt UMARKERT stå uten stempel').toBeNull()
    await stempleVinnerVarslet(admin, KAARING_SEED_POLL_ID.AVSLUTTET_UMARKERT)
    const foerste = await les()
    expect(foerste, 'første stempling skal sette verdien').not.toBeNull()

    // Pausen sikrer et ANNET tidsstempel; uten den kunne testen vært grønn
    // med CAS-en fjernet.
    await new Promise(r => setTimeout(r, 50))

    await stempleVinnerVarslet(admin, KAARING_SEED_POLL_ID.AVSLUTTET_UMARKERT)
    expect(
      await les(),
      'CAS-en (`.is(\'vinner_varslet_paa\', null)`) skal gjøre andre stempling til en no-op — ellers glir markøren fremover ved hver overlappende kjøring og retry-vinduet lukker seg aldri',
    ).toBe(foerste)
  })
})
