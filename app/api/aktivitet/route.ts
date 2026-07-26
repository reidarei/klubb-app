import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureInnlogget } from '@/lib/auth'
import { logg } from '@/lib/logg'

// Anonym aktivitetsmåling (#484). Endepunktet krever innlogging (skiller ekte
// bruk fra bots/crawlere), men user.id LESES ALDRI ut av objektet under og
// videreføres aldri til RPC-kallet eller logging — det er hele poenget med
// "anonym". Vi teller kun tre booleans, ingen identifikator.
export async function POST(req: Request) {
  try {
    await ensureInnlogget()
  } catch {
    return new NextResponse(null, { status: 204 })
  }

  // Tolerant parse — navigator.sendBeacon sender Blob som text/plain, ikke
  // application/json, så req.json() ville feile på content-type-sjekk hos
  // enkelte runtimes. Ugyldig/manglende body skal aldri kaste, kun telle 0.
  let body: Record<string, unknown> = {}
  try {
    body = JSON.parse(await req.text())
  } catch {
    // Behold tom body — treff/unik/uke telles da som false
  }

  const admin = createAdminClient()
  const { error } = await admin.rpc('tell_aktivitet', {
    p_unik_dag: !!body.unik,
    p_unik_uke: !!body.uke,
    p_treff: !!body.treff,
  })

  if (error) {
    // profil_id er whitelistet i lib/sentry-scrub.ts, men utelates BEVISST
    // her — denne målingen skal aldri kunne kobles til en person.
    await logg.feil('aktivitet.tell.feilet', error, { ctx: { code: error.code } })
  }

  // Alltid 204 uansett utfall — suksess er taus, og en feil her skal aldri
  // synes for klienten (sendBeacon leser ikke svaret uansett).
  return new NextResponse(null, { status: 204 })
}
