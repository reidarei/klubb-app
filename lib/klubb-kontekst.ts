import 'server-only'
import { cache } from 'react'
import { hentSesjon } from '@/lib/sesjon'
import { logg } from '@/lib/logg'
import { STANDARD_KLUBB_ID } from '@/lib/klubb-system'

// Standardklubbens id bor i lib/klubb-system.ts (delt med klubbForSystemjobb(), #871) —
// samme uuid som standard_klubb_id() i 161_klubb_id.sql. Annen kode går via aktivKlubbId().

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Claims = { klubb_status?: unknown; klubb_id?: unknown }

function dekodPayload(accessToken: string): Claims | null {
  try {
    const del = accessToken.split('.')[1]
    if (!del) return null
    const obj: unknown = JSON.parse(Buffer.from(del, 'base64url').toString('utf8'))
    return obj && typeof obj === 'object' ? (obj as Claims) : null
  } catch {
    return null
  }
}

// logg.feil persisterer til feil_logg (warn gjør ikke det). Eneste ekstra
// opplysning er klubb_status og evt. klubb_id fra claimen — aldri annet token-innhold.
// Feltene går via `ctx`: logg.feil() viderefører kun ctx til stdout/Sentry (`sample`
// leses ingen steder). feil_logg-raden får bare event-navnet, som alt skiller tilstandene.
// Objektliteralet står her, ikke hos kalleren, så logg-kontekst-dekning-vakten ser feltene.
function loggAvvik(
  event:
    | 'klubb.claim.mangler'
    | 'klubb.claim.hookfeil'
    | 'klubb.claim.avvik'
    | 'klubb.claim.inkonsistent',
  claim: { klubb_status?: string; klubb_id?: string } = {},
) {
  return logg
    .feil(event, new Error(event), {
      ctx: { klubb_status: claim.klubb_status, klubb_id: claim.klubb_id },
    })
    .catch(() => {})
}

/**
 * Hvilken klubb en innlogget forespørsel gjelder (#868, B1-kontrakten).
 *
 * Fase 1 (#869): leser claimen `klubb_id`/`klubb_status` fra access-tokenet
 * (custom_access_token_hook, mig. 166), men returnerer ALLTID standardklubben —
 * claimen er bare en observasjon som logges ved avvik, så oppførselen er
 * bit-identisk med før. Fallbacken fjernes i 2.4b (#896).
 *
 * Payloaden dekodes fra sesjonen hentSesjon() (getSession()) gir, uten signaturverifisering:
 * middleware har verifisert signatur og exp på samme cookie før siden rendres
 * (samme forbehold som lib/auth-cache.ts). Forutsetningen vaktes av
 * __tests__/klubb-kontekst-middleware.test.ts. Aldri nettverkskall eller ny verifisering her.
 *
 * Service-role, cron og `sendVarsel()` har ingen innlogget forespørsel og tar
 * `klubbId` eksplisitt fra 2.4.
 */
export const aktivKlubbId = cache(async (): Promise<string> => {
  const session = await hentSesjon() // delt med getInnloggetBruker(), én parsing per request
  if (!session?.access_token) return STANDARD_KLUBB_ID // ingen sesjon: stille

  const claims = dekodPayload(session.access_token)
  if (!claims) {
    await loggAvvik('klubb.claim.inkonsistent', { klubb_status: 'uleselig' })
    return STANDARD_KLUBB_ID
  }

  const status = claims.klubb_status
  if (status === undefined) {
    // Hooken er ikke aktivert, eller tokenet er utstedt før aktiveringen.
    await loggAvvik('klubb.claim.mangler')
  } else if (status === 'ingen_medlemskap') {
    // Stille: getProfil gir null og headeren degraderes.
  } else if (status === 'feil') {
    await loggAvvik('klubb.claim.hookfeil', { klubb_status: 'feil' })
  } else if (status === 'aktiv') {
    const id = claims.klubb_id
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
      await loggAvvik('klubb.claim.inkonsistent', { klubb_status: 'aktiv' })
    } else if (id.toLowerCase() !== STANDARD_KLUBB_ID) {
      await loggAvvik('klubb.claim.avvik', { klubb_status: 'aktiv', klubb_id: id })
    }
  } else {
    await loggAvvik('klubb.claim.inkonsistent', {
      klubb_status: typeof status === 'string' ? status.slice(0, 40) : typeof status,
    })
  }
  return STANDARD_KLUBB_ID
})
