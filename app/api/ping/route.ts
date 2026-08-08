// Lettvekts tilkoblingssjekk for dra-ned-for-oppdater (#572). Rører verken
// database, auth eller cookies — eneste jobb er å svare «serveren er nåbar
// herfra», slik at DraNedForOppdater kan skille en nettverksglipp fra en
// vellykket oppdatering FØR den kaller router.refresh().
//
// Hvorfor et eget endepunkt og ikke en HEAD mot gjeldende side: en HEAD mot
// f.eks. `/` ville rendret hele agendasiden på server for hver dra-ned. Denne
// svarer uten å gjøre noe arbeid.

import { NextResponse } from 'next/server'

// Ingen caching noe sted i kjeden: en cachet 204 ville sagt «nettet er oppe»
// også når det ikke er det, og gjort hele sjekken verdiløs. Service workeren
// hopper allerede over /api/ (se public/sw.js) — dette lukker Vercel- og
// nettleser-siden.
export const dynamic = 'force-dynamic'

export async function GET() {
  return new NextResponse(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store' },
  })
}
