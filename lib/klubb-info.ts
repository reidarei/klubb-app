// Klubbens stiftelsesdato, sted og «Om klubben»-tekst.
//
// Admin kan overstyre verdiene fra kontrollpanelet (/innstillinger/om-klubben,
// tabell klubb_info, migrasjon 157). Mangler raden eller en kolonne, gjelder
// defaulten fra lib/klubb-config.ts — så en klubb som aldri åpner siden ser
// akkurat det samme som før.

import { cache } from 'react'
import { createServerClient } from '@/lib/supabase/server'
import { KLUBB_STIFTET, KLUBB_STED, KLUBB_OM_AVSNITT } from '@/lib/klubb-config'
import { logg } from '@/lib/logg'

export type Stiftet = { aar: number; maaned: number; dag: number }

export type KlubbInfo = {
  stiftet: Stiftet
  sted: string
  omAvsnitt: readonly string[]
}

/** Avsnittene i en lagret om-tekst: skilt med minst én blank linje. */
export function delIAvsnitt(tekst: string): string[] {
  return tekst
    .split(/\n\s*\n/)
    .map(a => a.trim())
    .filter(Boolean)
}

/** 'YYYY-MM-DD' fra databasen → Stiftet. Ugyldig form gir null. */
export function lesStiftet(dato: string | null): Stiftet | null {
  const treff = dato?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!treff) return null
  return { aar: Number(treff[1]), maaned: Number(treff[2]), dag: Number(treff[3]) }
}

/** Stiftet → 'YYYY-MM-DD', formen <input type="date"> og databasen bruker. */
export function stiftetTilDato(s: Stiftet): string {
  return `${s.aar}-${String(s.maaned).padStart(2, '0')}-${String(s.dag).padStart(2, '0')}`
}

/**
 * Henter klubbinfo med defaultene lagt under.
 *
 * Argumentløs og cache()-wrappet, så Klubb-siden, agendaen og minikalenderen
 * deler ett oppslag per request (samme grunn som hentKartmodus()).
 *
 * Fail-open med logging: dette er visningstekst. En feilet spørring skal ikke
 * ta ned agendaen — utfallet er klubbens standardverdier, synlig i loggen.
 */
export const hentKlubbInfo = cache(async (): Promise<KlubbInfo> => {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('klubb_info')
    .select('stiftet, sted, om_tekst')
    .maybeSingle()
  if (error) logg.warn('klubb.info.feilet', { code: error.code })

  const om = data?.om_tekst ? delIAvsnitt(data.om_tekst) : []
  return {
    stiftet: lesStiftet(data?.stiftet ?? null) ?? KLUBB_STIFTET,
    sted: data?.sted?.trim() || KLUBB_STED,
    omAvsnitt: om.length > 0 ? om : KLUBB_OM_AVSNITT,
  }
})
