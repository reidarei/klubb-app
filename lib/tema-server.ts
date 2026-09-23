import { cookies } from 'next/headers'
import { TEMA_COOKIE, TEMA_VALG, type TemaValg } from './konstanter'

export async function lesTemaFraCookie(): Promise<TemaValg> {
  const c = await cookies()
  const v = c.get(TEMA_COOKIE)?.value
  if (v && (TEMA_VALG as readonly string[]).includes(v)) return v as TemaValg
  return 'dark'
}

export function resolveServerTema(valg: TemaValg): 'dark' | 'light' {
  // 'system' resolveres på klient via pre-hydration-script.
  // Server defaulter til dark — kortvarig flash av dark hvis OS er light og bruker valgte 'system'.
  // Akseptert trade-off; iOS Safari kan ikke avgjøre OS-tema før klient-JS kjører.
  return valg === 'light' ? 'light' : 'dark'
}
