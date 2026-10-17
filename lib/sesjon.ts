import 'server-only'
import { cache } from 'react'
import { createServerClient } from '@/lib/supabase/server'

/**
 * Sesjonen fra cookien, lest ÉN gang per request (#869-review). getInnloggetBruker()
 * og aktivKlubbId() er to ulike cache()-funksjoner og delte derfor ikke resultat —
 * nå leser begge herfra. Egen modul for å unngå sykel lib/auth-cache ↔ lib/klubb-kontekst.
 *
 * getSession() dekoder cookien lokalt uten å verifisere signaturen; det er greit fordi
 * middleware har verifisert signatur og exp på samme cookie (se lib/auth-cache.ts og
 * __tests__/klubb-kontekst-middleware.test.ts). Aldri getUser()/getClaims() her.
 *
 * NB: cache() memoiserer kun under React-rendring (server components). I route handlers
 * og server actions kjører den på nytt per kall — derfor returnerer ensure*() klubb-id-en.
 */
export const hentSesjon = cache(async () => {
  const supabase = await createServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session
})
