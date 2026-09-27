import { NextRequest, NextResponse } from 'next/server'
import { ensureInnlogget } from '@/lib/auth'
import { hentForhaandsvisning } from '@/lib/lenke-forhaandsvisning'
import { normaliserLenke } from '@/lib/lenke-forhaandsvisning-core'
import { LENKE_CACHE_SEK, LENKE_MAKS_LENGDE } from '@/lib/konstanter'

// Node-runtime: SSRF-vakta trenger node:dns for å slå opp vertens adresser.
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  // Kun innloggede — ellers er ruta en åpen henteproxy for hvem som helst.
  try {
    await ensureInnlogget()
  } catch {
    return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })
  }

  const raa = req.nextUrl.searchParams.get('url') ?? ''
  if (!raa || raa.length > LENKE_MAKS_LENGDE || !/^https?:\/\//i.test(raa)) {
    return NextResponse.json({ error: 'Ugyldig url' }, { status: 400 })
  }

  const data = await hentForhaandsvisning(normaliserLenke(raa))
  if (data === undefined) {
    // Midlertidig feil — prøv igjen neste gang, ikke husk «ingenting».
    return NextResponse.json(null, { headers: { 'Cache-Control': 'no-store' } })
  }
  // private: svaret er bak innlogging og skal ikke ligge i en delt CDN-cache,
  // men telefonen kan gjerne huske det — da blar man i chatten uten nye kall.
  return NextResponse.json(data, {
    headers: { 'Cache-Control': `private, max-age=${LENKE_CACHE_SEK}` },
  })
}
