import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { harTestCreds } from './helpers/auth'

// Vakt over auth-porten.
//
// Bakgrunn: middleware brukte getSession(), som dekoder auth-cookien LOKALT uten
// å verifisere signaturen eller `exp`. @supabase/auth-js dokumenterer den som
// «insecure on the server». En cookie med utløpt eller tuklet token slapp derfor
// forbi porten og feilet først inne på siden — som en `error`-rad i feil_logg og
// en Sentry-alarm, for noe som skulle vært en ren redirect til /login.
//
// Testene tar en EKTE innlogget sesjon og bytter ut bare access_token. Det er
// vesentlig: en håndlaget cookie blir ikke parset av @supabase/ssr i det hele
// tatt, så `session` blir null og redirecten skjer av feil grunn — testen ville
// da bestått også på den gamle koden (verifisert med mutasjonstest). Ved å
// beholde cookiens struktur OG sessionens `expires_at` i framtiden, tvinger vi
// getSession() til å returnere en session, slik at det utelukkende er
// token-verifiseringen som kan avvise den.
//
// Hva testene IKKE dekker: test-instansen signerer med symmetrisk HS256, og da
// faller getClaims() internt tilbake til getUser(). Avvisningen bevises altså
// via fallback-stien. Prod bruker ES256 og verifiserer lokalt mot JWKS. Begge
// ender i samme beslutning — det er den vi pinner — men den lokale kryptostien
// har ingen e2e-dekning før test-instansen også får asymmetriske nøkler.

const AUTH_FIL = path.join('e2e', '.auth', 'state.json')

type Cookie = { name: string; value: string; domain: string; path: string }

/** Leser den lagrede sesjonen og returnerer auth-cookien + dekodet innhold. */
function lesAuthCookie(): { cookie: Cookie; sesjon: Record<string, unknown> } | null {
  if (!fs.existsSync(AUTH_FIL)) return null
  const state = JSON.parse(fs.readFileSync(AUTH_FIL, 'utf8')) as { cookies: Cookie[] }
  const cookie = state.cookies.find(c => /^sb-.*-auth-token$/.test(c.name))
  if (!cookie?.value.startsWith('base64-')) return null
  const json = Buffer.from(cookie.value.slice('base64-'.length), 'base64').toString('utf8')
  return { cookie, sesjon: JSON.parse(json) as Record<string, unknown> }
}

/** Re-enkoder en modifisert sesjon tilbake til cookie-formatet. */
function tilCookieVerdi(sesjon: Record<string, unknown>): string {
  return 'base64-' + Buffer.from(JSON.stringify(sesjon), 'utf8').toString('base64')
}

/** Bytter ut payload i en JWT og ødelegger dermed signaturen. */
function medPayload(jwt: string, endring: Record<string, unknown>): string {
  const [header, payload, signatur] = jwt.split('.')
  const gammel = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
  const ny = Buffer.from(JSON.stringify({ ...gammel, ...endring }), 'utf8').toString('base64url')
  return [header, ny, signatur].join('.')
}

test.describe('middleware verifiserer access-tokenet', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test.use({ storageState: { cookies: [], origins: [] } })

  async function settTuklet(
    context: import('@playwright/test').BrowserContext,
    endring: Record<string, unknown>,
  ): Promise<boolean> {
    const lest = lesAuthCookie()
    if (!lest) return false

    const accessToken = lest.sesjon.access_token
    if (typeof accessToken !== 'string') return false

    await context.addCookies([
      {
        ...lest.cookie,
        value: tilCookieVerdi({
          ...lest.sesjon,
          access_token: medPayload(accessToken, endring),
          // Holdes i framtiden med vilje: ellers ville getSession() prøvd å
          // refreshe og returnert null, og vi hadde testet refresh-stien i
          // stedet for verifiseringen.
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        }),
      },
    ])
    return true
  }

  test('token med tuklet payload gir redirect til /login', async ({ context, page }) => {
    // Rettighetseskalering er det skarpeste tilfellet: payloaden hevder
    // service_role. Signaturen dekker payloaden, så endringen gjør tokenet
    // ugyldig — og exp holdes i framtiden, slik at det utelukkende er
    // signaturverifiseringen som kan avvise det.
    const ok = await settTuklet(context, {
      exp: Math.floor(Date.now() / 1000) + 3600,
      role: 'service_role',
    })
    test.skip(!ok, 'fant ingen lagret auth-cookie å tukle med')

    await page.goto('/chat')

    await expect(page).toHaveURL(/\/login/)
  })

  // Bevisst INGEN test for «utløpt token»: getSession() oppdager utløpet og
  // fornyer sesjonen med refresh-tokenet, som den skal. Et utløpt access-token
  // med gyldig refresh-token ender derfor korrekt med at brukeren blir stående
  // innlogget. Skal man tvinge fram avvisning må refresh-tokenet også være
  // ugyldig — men da er `session` null allerede før porten, og testen ville
  // bestått uten at verifiseringen fantes. Verifisert med mutasjonstest.
})
