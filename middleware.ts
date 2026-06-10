import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Offentlige API-ruter som ikke krever auth (webhooks, cron)
  if (request.nextUrl.pathname.startsWith('/api/github/') ||
      request.nextUrl.pathname.startsWith('/api/cron/')) {
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

  const { data: { session } } = await supabase.auth.getSession()

  const erPaaLogin = request.nextUrl.pathname === '/login'
  const erPaaOppdaterPassord = request.nextUrl.pathname === '/oppdater-passord'
  const erOffentlig = erPaaLogin || erPaaOppdaterPassord

  if (!session && !erOffentlig) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (session && erPaaLogin) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon-|api/cron/|api/github/|.*\\.jpg|.*\\.png|.*\\.svg|.*\\.webp).*)'],
}
