'use server'

import { cookies } from 'next/headers'
import { ensureInnlogget } from '@/lib/auth'
import { TEMA_COOKIE, TEMA_VALG, type TemaValg } from '@/lib/konstanter'
import { logg } from '@/lib/logg'

export async function oppdaterTema(valg: TemaValg) {
  if (!(TEMA_VALG as readonly string[]).includes(valg)) {
    // Logges som warn — brukerinput-feil, ikke programfeil
    logg.warn('tema.ugyldig', { sample: String(valg) })
    throw new Error('Ugyldig tema-valg')
  }
  await ensureInnlogget()
  const c = await cookies()
  c.set(TEMA_COOKIE, valg, {
    maxAge: 60 * 60 * 24 * 365, // 1 år
    path: '/',
    sameSite: 'lax',
    secure: true,
    httpOnly: true, // Klient bruker localStorage som speil
  })
}
