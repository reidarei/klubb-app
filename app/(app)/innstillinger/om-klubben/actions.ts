'use server'

import { revalidatePath } from 'next/cache'
import { ensureAdmin } from '@/lib/auth'
import { naa } from '@/lib/dato'
import { lesStiftet } from '@/lib/klubb-info'
import { KLUBB_STED_MAKS, KLUBB_OM_MAKS } from '@/lib/konstanter'

// Resultat i stedet for kast: kallet skjer fra en transition, og en avvist
// server action der ville byttet ut hele siden med feilskjermen (samme
// begrunnelse som oppdaterTestEpost i ../actions.ts).
export type LagreKlubbInfoResultat = { ok: true } | { ok: false; feil: string }

/** Lagrer stiftelsesdato, sted og om-tekst (/innstillinger/om-klubben). */
export async function lagreKlubbInfo(input: {
  stiftet: string
  sted: string
  omTekst: string
}): Promise<LagreKlubbInfoResultat> {
  const { supabase } = await ensureAdmin()

  const stiftet = lesStiftet(input.stiftet)
  // lesStiftet sjekker bare formen; en dato som 2007-02-31 ville Postgres avvist.
  if (!stiftet || new Date(Date.UTC(stiftet.aar, stiftet.maaned - 1, stiftet.dag)).getUTCDate() !== stiftet.dag) {
    return { ok: false, feil: 'Velg en gyldig stiftelsesdato.' }
  }
  const sted = input.sted.trim()
  if (!sted) return { ok: false, feil: 'Stedet kan ikke være tomt.' }
  if (sted.length > KLUBB_STED_MAKS) return { ok: false, feil: `Stedet kan være maks ${KLUBB_STED_MAKS} tegn.` }
  // Linjeskift normaliseres så avsnittsskillet (blank linje) er det samme
  // uansett hva iOS-tastaturet sender.
  const omTekst = input.omTekst.replace(/\r\n?/g, '\n').trim()
  if (!omTekst) return { ok: false, feil: 'Teksten om klubben kan ikke være tom.' }
  if (omTekst.length > KLUBB_OM_MAKS) return { ok: false, feil: `Teksten kan være maks ${KLUBB_OM_MAKS} tegn.` }

  // Én rad (id = true). RLS (er_admin()) er vakten.
  const { error } = await supabase
    .from('klubb_info')
    .upsert({ id: true, stiftet: input.stiftet, sted, om_tekst: omTekst, oppdatert: naa() }, { onConflict: 'id' })
  if (error) return { ok: false, feil: `Kunne ikke lagre: ${error.message}` }

  // Klubb-siden viser alt, agendaen jubileet og minikalenderen stiftelsesdagen.
  revalidatePath('/klubbinfo')
  revalidatePath('/')
  revalidatePath('/innstillinger', 'layout')
  return { ok: true }
}
