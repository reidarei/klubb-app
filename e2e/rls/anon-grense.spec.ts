import { test, expect } from '@playwright/test'
import { harRlsMiljo, TESTBRUKERE } from '../helpers/rls-klienter'
import { SEED_PASSORD } from '../helpers/auth'

// Regresjonsvakt mot GRANT-klippen 30.10.2026 (#412/#416, se CLAUDE.md §
// Policy: Migrasjoner). En ikke-innlogget klient skal ikke få lese NOE fra
// public-schema — verken via en manglende RLS-policy eller (mest sannsynlig
// årsak til en fremtidig regresjon) en glemt eksplisitt GRANT på en ny
// tabell.
//
// Rå `fetch` i stedet for supabase-js: `.from(tabellnavn)` med en dynamisk
// streng krever typecasting mot de genererte typene (Database), og
// `npm run typecheck` dekker `e2e/` — vi vil ikke måtte holde en typecast
// oppdatert for hver ny tabell testen finner, og poenget med testen er
// nettopp at den IKKE skal kreve en kodeendring når en ny tabell dukker opp.

test.describe('anon skal ikke kunne lese NOEN tabell i public-schema (#533)', () => {
  test.skip(!harRlsMiljo(), 'E2E_SUPABASE_* mangler — se docs/test-instans.md')

  test('anon får 401/403 fra samtlige public-tabeller PostgREST eksponerer', async () => {
    const url = process.env.E2E_SUPABASE_URL!
    const anonKey = process.env.E2E_SUPABASE_ANON_KEY!
    const serviceKey = process.env.E2E_SUPABASE_SERVICE_KEY!

    // Vakt mot ugyldig nøkkel, kjøres FØRST: uten denne kunne en
    // feilkonfigurert ANON_KEY (f.eks. kopiert feil fra `supabase status`)
    // gi 401 på ALLE tabeller av «Invalid API key» — og testen ville vært
    // grønn uten å bevise at RLS/GRANT faktisk stopper noe.
    const loginSvar = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: TESTBRUKERE.PETTER.epost, password: SEED_PASSORD }),
    })
    const loginKropp = await loginSvar.json().catch(() => null)
    expect(
      loginSvar.status,
      `anon-nøkkelen kunne ikke logge inn Petter (status ${loginSvar.status}) — ugyldig ` +
        `E2E_SUPABASE_ANON_KEY? Body: ${JSON.stringify(loginKropp)}`,
    ).toBe(200)

    // Innloggingen over beviser at nøkkelen er gyldig mot GoTrue — ikke at
    // PostgREST svarer 200 på NOE med den. Uten denne kontrollen kunne 401 på
    // samtlige tabeller under skyldes at PostgREST avviser apikey-headeren i
    // seg selv (feil JWT-secret på instansen, feil `apikey` vs `Authorization`-
    // kombinasjon), og testen ville vært grønn uten å bevise at det er
    // GRANT/RLS som stenger. Vi gjenbruker access_tokenet fra login-svaret:
    // samme anon-nøkkel som apikey, men med en innlogget bruker som bærer.
    const token: string | undefined = loginKropp?.access_token
    expect(token, 'login-svaret manglet access_token').toBeTruthy()
    const innloggetSvar = await fetch(`${url}/rest/v1/arrangementer?select=id&limit=1`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    })
    expect(
      innloggetSvar.status,
      `PostgREST svarte ${innloggetSvar.status} på en INNLOGGET lesning av arrangementer ` +
        `(${await innloggetSvar.text()}) — da beviser 401-ene under ingenting om anon.`,
    ).toBe(200)

    // Enumerer tabeller DYNAMISK fra PostgREST sitt OpenAPI-dokument, hentet
    // med service_role (som alltid ser hele schemaet uansett GRANT). Ingen
    // hardkodet tabelliste — en ny tabell skal dekkes automatisk uten at
    // noen husker å legge den til her.
    const openApiSvar = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    })
    expect(openApiSvar.ok, `Kunne ikke hente PostgREST sitt OpenAPI-dokument: ${openApiSvar.status}`).toBeTruthy()
    const openApi = await openApiSvar.json()

    const paths: string[] = Object.keys(openApi.paths ?? {})
    let tabeller = paths.filter(p => p !== '/' && !p.startsWith('/rpc/')).map(p => p.replace(/^\//, ''))
    if (tabeller.length === 0) {
      // Fallback for PostgREST-versjoner som lister tabeller under
      // `definitions` i stedet for `paths`.
      tabeller = Object.keys(openApi.definitions ?? {})
    }

    // Vakt mot tom enumerering: uten denne blir testen grønn på en tom liste
    // (ingen iterasjoner = ingen feil) hvis OpenAPI-formatet endrer seg under
    // oss. Fasit i dag (2026-07) er 42 tabeller — 35 gir margin uten å være
    // verdiløs.
    expect(
      tabeller.length,
      `Fant kun ${tabeller.length} tabeller via PostgREST sitt OpenAPI-dokument — forventet minst 35. ` +
        `Enten er schemaet krympet drastisk, eller enumereringen er brutt (sjekk paths/definitions-formatet).`,
    ).toBeGreaterThanOrEqual(35)

    const feil: string[] = []
    for (const tabell of tabeller) {
      const svar = await fetch(`${url}/rest/v1/${tabell}?select=*&limit=1`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      })
      if (svar.status !== 401 && svar.status !== 403) {
        feil.push(`${tabell}: forventet HTTP 401/403, fikk ${svar.status} (${await svar.text()})`)
        continue
      }
      const kropp = await svar.json().catch(() => null)
      const erAutorisasjonsfeil =
        kropp?.code === '42501' ||
        (typeof kropp?.message === 'string' && kropp.message.toLowerCase().includes('permission denied'))
      if (!erAutorisasjonsfeil) {
        feil.push(
          `${tabell}: fikk HTTP ${svar.status}, men body matchet verken code 42501 eller ` +
            `«permission denied»: ${JSON.stringify(kropp)}`,
        )
      }
    }

    expect(feil, `${feil.length} av ${tabeller.length} tabeller lekker til anon:\n${feil.join('\n')}`).toEqual([])
  })

  // Løkka over har ett blindpunkt: den enumererer med service_role, så en
  // tabell med anon-grant men UTEN service_role-grant er usynlig for den og
  // blir aldri testet. PostgREST bygger OpenAPI-dokumentet av det den
  // FORESPØRRENDE rollen faktisk har privilegier på — henter vi det som anon,
  // skal tabell-listen være tom, og det dekker select/insert/update/delete i
  // én assertion (en tabell med kun insert-grant ville dukket opp her).
  test('PostgREST eksponerer null tabeller for anon (dekker også skrive-grants)', async () => {
    const url = process.env.E2E_SUPABASE_URL!
    const anonKey = process.env.E2E_SUPABASE_ANON_KEY!

    const svar = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    })
    expect(svar.ok, `Kunne ikke hente OpenAPI-dokumentet som anon: ${svar.status}`).toBeTruthy()
    const dok = await svar.json()

    // `/` (rot-dokumentet) og `/rpc/…` filtreres bort. RPC-ene er bevisst
    // utenfor: Postgres gir `execute` til PUBLIC som default, så et knippe
    // hjelpefunksjoner (er_admin, har_pass_tilgang, …) er kallbare for anon.
    // Verifisert manuelt under #533-reviewen at ingen av dem lekker data —
    // de returnerer false/no-op eller 42501 fra tabellen de leser. Det er en
    // egen problemklasse (funksjons-grants, ikke tabell-grants) og har ingen
    // dekning her ennå.
    const tabellPaths = Object.keys(dok.paths ?? {}).filter(p => p !== '/' && !p.startsWith('/rpc/'))
    const definisjoner = Object.keys(dok.definitions ?? {})

    expect(
      tabellPaths,
      `PostgREST lister ${tabellPaths.length} tabell(er) for anon — da har anon minst ett ` +
        `privilegium på dem (select/insert/update/delete). Se CLAUDE.md § Policy: Migrasjoner.`,
    ).toEqual([])
    expect(definisjoner, 'anon skal heller ikke se tabell-definisjoner i OpenAPI-dokumentet').toEqual([])
  })
})
