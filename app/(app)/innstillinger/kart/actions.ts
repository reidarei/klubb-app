'use server'

import { revalidatePath } from 'next/cache'
import { ensureAdmin } from '@/lib/auth'
import { naa } from '@/lib/dato'
import { SYMBOLER_VARSLER } from '@/lib/markering-symboler'
import { erEnEmoji } from '@/lib/kart-symbol-tilpasning'
import { KART_SYMBOL_NAVN_MAKS } from '@/lib/konstanter'

// Resultat i stedet for kast: kallet skjer fra en transition, og en avvist
// server action der ville byttet ut hele siden med feilskjermen (samme
// begrunnelse som oppdaterTestEpost i ../actions.ts).
export type LagreSymbolResultat = { ok: true } | { ok: false; feil: string }

/** Setter navn og emoji på ett varslende kartsymbol (/innstillinger/kart). */
export async function lagreKartSymbol(
  symbol: string,
  etikett: string,
  emoji: string,
): Promise<LagreSymbolResultat> {
  const { supabase } = await ensureAdmin()

  // Kun de varslende symbolene kan tilpasses — en annen id ville gitt en rad
  // lib/kart-symbol-tilpasning.ts uansett ignorerer.
  if (!SYMBOLER_VARSLER.some(s => s.id === symbol)) {
    return { ok: false, feil: 'Ukjent symbol.' }
  }

  const rentNavn = etikett.trim()
  const renEmoji = emoji.trim()
  if (!rentNavn) return { ok: false, feil: 'Navnet kan ikke være tomt.' }
  if (rentNavn.length > KART_SYMBOL_NAVN_MAKS) {
    return { ok: false, feil: `Navnet kan være maks ${KART_SYMBOL_NAVN_MAKS} tegn.` }
  }
  // Én emoji, ikke fritekst: symbolknappen og boblen på kartet har plass til
  // nøyaktig ett tegn. erEnEmoji() dekker også grensen i migrasjon 156.
  if (!erEnEmoji(renEmoji)) return { ok: false, feil: 'Symbolet må være nøyaktig én emoji.' }

  // Enkelt-objekt-upsert setter kun payloadens kolonner ved konflikt (se
  // KJENTE_FLAGG i lib/app-innstillinger.ts). RLS (er_admin()) er vakten.
  const { error } = await supabase
    .from('kart_symbol_tilpasning')
    .upsert({ symbol, etikett: rentNavn, emoji: renEmoji, oppdatert: naa() }, { onConflict: 'symbol' })
  if (error) return { ok: false, feil: `Kunne ikke lagre: ${error.message}` }

  revalidatePath('/kart')
  revalidatePath('/innstillinger')
  revalidatePath('/innstillinger/kart')
  return { ok: true }
}
