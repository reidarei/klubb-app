'use server'

import { cookies } from 'next/headers'
import { ensureInnlogget } from '@/lib/auth'
import { TEMA_COOKIE, TEMA_VALG, type TemaValg } from '@/lib/konstanter'

export async function oppdaterTema(valg: TemaValg) {
  if (!(TEMA_VALG as readonly string[]).includes(valg)) {
    // Logges så manipulerte server-action-kall blir synlige i Vercel-loggene
    console.error('[tema] ugyldig valg:', valg)
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
