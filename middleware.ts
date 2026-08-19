import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { hentJwks } from '@/lib/auth-jwks'

type SupabaseKlient = ReturnType<typeof createServerClient>

/**
 * Verifiserer at access-tokenet er ekte og ikke utløpt.
 *
 * getClaims() sjekker signaturen mot prosjektets JWKS og validerer `exp`.
 * Tokenene våre er ES256 med `kid`, så verifiseringen skjer LOKALT via
 * WebCrypto — ingen nettverksrunde per navigasjon, i motsetning til getUser().
 * (Var tokenene symmetriske HS256, ville getClaims() falt tilbake til getUser()
 * internt; det er verdt å vite hvis signeringsnøklene noen gang rulles om.)
 *
 * Fail closed: alt som ikke er en verifisert claim regnes som utlogget.
 */
async function harGyldigSesjon(
  supabase: SupabaseKlient,
  accessToken: string | undefined,
): Promise<boolean> {
  if (!accessToken) return false

  const jwks = await hentJwks()
  // Uten cachede nøkler sendes ingen `keys` inn, og auth-js henter dem selv
  // (eller faller til getUser()). Tregere, men fortsatt verifisert — vi slipper
  // aldri noen gjennom bare fordi nøkkelsettet var utilgjengelig.
  const { data } = await supabase.auth.getClaims(
    accessToken,
    jwks ? { keys: jwks.keys } : undefined,
  )
  return !!data?.claims
}

export async function middleware(request: NextRequest) {
  // Offentlige API-ruter som ikke krever auth (webhooks, cron, tilkoblingssjekk)
  // /api/ping er bevisst uten auth: den skal måle «når serveren fram?», ikke
  // «er sesjonen gyldig?». Med auth ville en utløpt sesjon blitt rapportert som
  // nettverksfeil i dra-ned-gesten (#572).
  if (request.nextUrl.pathname.startsWith('/api/github/') ||
      request.nextUrl.pathname.startsWith('/api/cron/') ||
      request.nextUrl.pathname === '/api/ping') {
    return NextResponse.next()
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getSession() beholdes fordi det er DEN som utfører token-refresh og legger
  // ferske cookies på responsen — men den er ikke sannheten om hvem brukeren er.
  // @supabase/auth-js dokumenterer den eksplisitt som «insecure on the server»:
  // den dekoder cookien lokalt uten å verifisere signaturen, og validerer heller
  // ikke exp. En cookie med utløpt eller manipulert token slapp derfor forbi
  // porten her og feilet først inne på siden, som en `error` i feil_logg for noe
  // som skulle vært en ren redirect til /login.
  const { data: { session } } = await supabase.auth.getSession()

  const erPaaLogin = request.nextUrl.pathname === '/login'
  const erPaaOppdaterPassord = request.nextUrl.pathname === '/oppdater-passord'
  const erOffentlig = erPaaLogin || erPaaOppdaterPassord

  const innlogget = await harGyldigSesjon(supabase, session?.access_token)

  if (!innlogget && !erOffentlig) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (innlogget && erPaaLogin) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon-|api/cron/|api/github/|api/ping|.*\\.jpg|.*\\.png|.*\\.svg|.*\\.webp).*)'],
}
