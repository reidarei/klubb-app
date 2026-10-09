// Varsel til alle andre aktive om at noen har bursdag i dag (#638).
//
// Bevisst uavhengig av gratulasjonen i klubbchatten
// (bursdagsgratulasjon.ts): går selv om ingen admin har
// bursdagsgratulasjon_aktiv, og selv om ingen chat-post finnes. Deler kun
// datoregelen (lib/bursdag.ts).
//
// E-post: bursdag_i_dag er ikke en chat-type og passerer chat-budsjettvakten,
// men gratulasjonsposten samme morgen spiser av det. Bevisst valgt —
// bursdagsvarselet er viktig.
//
// Ingen slotIndex: sender ved første anledning; senere slots er retry, og
// dedupNoekkel gir 23505 (dedupHoppet) for dem som alt har fått det.
// varsel_logg bærer kvitteringen fordi det ikke finnes noen tilstandsrad å
// stemple (jf. CLAUDE.md § Policy: Varsler).

import { iDagOslo } from '@/lib/dato'
import { finnBursdagsbarn, alderIAar } from '@/lib/bursdag'
import { sendVarsel } from '@/lib/varsler'
import { logg } from '@/lib/logg'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

type Admin = SupabaseClient<Database>

export async function kjorBursdagsvarsel(
  admin: Admin,
): Promise<{ varslet: number; hoppet: number; blokkert: number; feil: number }> {
  let varslet = 0
  let hoppet = 0
  let blokkert = 0
  let feil = 0

  // Uten fodselsdato-filter: mottakerne er alle aktive, også dem uten kjent dato.
  const { data: alle, error: profilerFeil } = await admin
    .from('profiles')
    .select('id, navn, fodselsdato')
    .eq('aktiv', true)

  // Fail closed: feil ≠ «ingen har bursdag i dag» (#504).
  if (profilerFeil) {
    await logg.feil('bursdagsvarsel.profiler.feilet', profilerFeil)
    feil++
    return { varslet, hoppet, blokkert, feil }
  }

  if (!alle || alle.length === 0) {
    return { varslet, hoppet, blokkert, feil }
  }

  const iDag = iDagOslo()
  const bursdagsbarn = finnBursdagsbarn(alle, iDag)

  if (bursdagsbarn.length === 0) {
    return { varslet, hoppet, blokkert, feil }
  }

  for (const barn of bursdagsbarn) {
    const mottakere = alle.filter(p => p.id !== barn.id).map(p => p.id)

    if (mottakere.length === 0) {
      // Ingen andre aktive — unngå varsel.mottakere.tomme én gang per slot.
      hoppet++
      continue
    }

    // Alder vises alt på BursdagKort; gjentas så teksten står alene i innboksen.
    // `as string` er trygt: finnBursdagsbarn filtrerer bort profiler uten dato.
    const alder = alderIAar(barn.fodselsdato as string, iDag)
    // Fullt `navn`: visningsnavn er i praksis fornavnet (mig. 018), og flere
    // deler fornavn — varselet lenker til /chat, ikke profilen.
    const navn = barn.navn

    try {
      const utfall = await sendVarsel({
        mottakere,
        tittel: 'Bursdag i klubben 🎂',
        melding: `${navn} fyller ${alder} i dag.`,
        url: '/chat',
        type: 'bursdag_i_dag',
        // Per barn og år, ikke per avsender — ett varsel, uansett antall admins.
        dedupNoekkel: `bursdag_i_dag:${barn.id}:${iDag.split('-')[0]}`,
        // tellerUlest (default true) og pushTag (ingen) står bevisst på default:
        // ikke lavsignal, og en tag ville latt en senere chat-melding kollapse
        // varselet bort fra låseskjermen.
      })

      // Tellerne skiller på utfall: «levert 0» kan bety både «alt varslet» og
      // «typen er skrudd av».
      if (utfall.levert > 0 || utfall.kunApp > 0) {
        varslet++
      } else if (utfall.utfall === 'dedup' || utfall.utfall === 'ingen_mottakere') {
        // dedup = varslet fra et tidligere slot; ingen_mottakere = ingen å varsle.
        hoppet++
      } else {
        // type_deaktivert, blokkert_lokal eller hendelse_passert: ingenting
        // sendt, og ingen senere slot endrer det — men ingen feil.
        blokkert++
      }
    } catch (e) {
      // Én manns feil skal ikke rive med seg neste bursdagsbarn.
      await logg.feil('bursdagsvarsel.feilet', e, { ctx: { profil_id: barn.id } })
      feil++
    }
  }

  return { varslet, hoppet, blokkert, feil }
}
