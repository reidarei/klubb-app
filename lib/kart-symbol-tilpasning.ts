// Admin-styrt navn og emoji på de varslende kartsymbolene (/innstillinger/kart).
//
// Registeret i lib/klubb-symboler.ts er fortsatt sannheten for HVILKE symboler
// som finnes og hvilke som varsler. Tabellen kart_symbol_tilpasning (migrasjon
// 156) overstyrer kun etikett og emoji — id-en er det som lagres på
// markeringene og endres aldri, så et nytt navn slår igjennom på alle
// eksisterende markeringer uten datamigrering.
//
// Kun de varslende symbolene kan tilpasses. En rad for et stille symbol (eller
// et symbol som er fjernet fra registeret) ignoreres her, ikke kastet: den kan
// bare ha kommet inn direkte i databasen, og kartet skal ikke tas ned av den.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { MARKERING_SYMBOLER, SYMBOLER_VARSLER, type KlubbSymbol } from '@/lib/markering-symboler'
import { logg } from '@/lib/logg'

export type SymbolTilpasning = { symbol: string; etikett: string; emoji: string }

/**
 * Registeret med tilpasningene lagt på. Bevarer registerets rekkefølge.
 *
 * Varseltekstene avledes av det nye navnet når et symbol er tilpasset —
 * ellers ville varselet fortsatt brukt det opprinnelige navnet etter at admin
 * døpte symbolet om. Uten tilpasning brukes registerets egne tekster ordrett,
 * så ingenting endrer seg for en klubb som aldri åpner siden.
 */
export function anvendTilpasninger(
  tilpasninger: readonly SymbolTilpasning[],
): KlubbSymbol[] {
  const varslende = new Set<string>(SYMBOLER_VARSLER.map(s => s.id))
  const perSymbol = new Map(
    tilpasninger.filter(t => varslende.has(t.symbol)).map(t => [t.symbol, t]),
  )
  return MARKERING_SYMBOLER.map((s): KlubbSymbol => {
    const t = perSymbol.get(s.id)
    if (!t || !s.varsel) return s
    const etikett = t.etikett.trim()
    return {
      ...s,
      etikett,
      emoji: t.emoji,
      varsel: {
        ...s.varsel,
        tittel: `${etikett.toUpperCase()} ALERT!`,
        panel: `${etikett} alert (når noen setter en ${t.emoji}-markering på kartet)`,
        kort: `${etikett} alert`,
      },
    }
  })
}

/**
 * Henter tilpasningene og returnerer det ferdige registeret.
 *
 * Fail-open med logging: navn og emoji er pynt på kartet, og en feilet
 * spørring skal ikke ta ned kartet eller hindre at en markering lagres.
 * Utfallet er registerets standardnavn — synlig feil i loggen, ikke i UI.
 */
export async function hentKartSymboler(
  supabase: SupabaseClient<Database>,
): Promise<KlubbSymbol[]> {
  const { data, error } = await supabase
    .from('kart_symbol_tilpasning')
    .select('symbol, etikett, emoji')
  if (error) {
    logg.warn('kart.symbol.tilpasning.feilet', { code: error.code })
    return [...MARKERING_SYMBOLER]
  }
  return anvendTilpasninger(data ?? [])
}

/** Emojien for en lagret symbol-id, slått opp i et (tilpasset) register. */
export function emojiI(symboler: readonly KlubbSymbol[], id: string): string {
  return (symboler.find(s => s.id === id) ?? symboler[0]).emoji
}

/**
 * Sant hvis teksten er nøyaktig ÉN emoji (ett grafem som er et
 * piktogram eller et flagg). Grafem, ikke tegn: 👍🏽 og 🏳️‍🌈 er flere code
 * points, men ett symbol på skjermen. En bokstav eller to emojier avvises —
 * symbolknappen og boblen på kartet har plass til nøyaktig én.
 */
export function erEnEmoji(tekst: string): boolean {
  const grafemer = [...new Intl.Segmenter('nb', { granularity: 'grapheme' }).segment(tekst)]
  if (grafemer.length !== 1) return false
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(tekst)
}
