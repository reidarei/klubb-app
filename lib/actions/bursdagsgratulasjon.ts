// Automatisk bursdagsgratulasjon i klubb-chat. Se #328.
//
// Per-admin logikk: alle aktive admins med bursdagsgratulasjon_aktiv = true
// sender én post per bursdagsbarn per år. To admins med toggle på → to poster.
// Idempotens sikres via kilde_ekstern_id = «bursdag:{barnId}:{år}:{adminId}»
// — unik per avsender, slik at begge kan poste uten å slette hverandres.
//
// Varsel til bursdagsbarnet sendes kun én gang selv om flere admins poster —
// varselSendt-flagget per barn sikrer dette.

import { formatInTimeZone } from 'date-fns-tz'
import { TIDSSONE } from '@/lib/dato'
import {
  BURSDAG_EMOJI_POOL,
  BURSDAG_EMOJI_ANTALL,
  BURSDAG_HILSNER,
  BURSDAG_UTROPSTEGN,
} from '@/lib/konstanter'
import { sendVarsel } from '@/lib/varsler'
import { rollerMed } from '@/lib/roller'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

type Admin = SupabaseClient<Database>

// Trekker N unike emoji frå poolen via Fisher-Yates-shuffle (subset-variant).
// Bruker Math.random() — kryptografisk tilfeldighet er ikke et krav her.
function trekkEmoji(antall: number): string[] {
  const pool = [...BURSDAG_EMOJI_POOL]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, antall)
}

export async function kjorBursdagsgratulasjon(
  admin: Admin,
  { slotIndex, totalSlots }: { slotIndex: number; totalSlots: number },
): Promise<{ sendt: number; hoppet: number; feil: number }> {
  let sendt = 0
  let hoppet = 0
  let feil = 0

  // 1. Finn dagens dato som MM-DD i norsk tid
  const idag = new Date()
  const dagStr = formatInTimeZone(idag, TIDSSONE, 'MM-dd')
  const aarStr = formatInTimeZone(idag, TIDSSONE, 'yyyy')

  // 2. Hent aktive profiler med fødselsdato
  const { data: profiler } = await admin
    .from('profiles')
    .select('id, navn, visningsnavn, fodselsdato')
    .eq('aktiv', true)
    .not('fodselsdato', 'is', null)

  if (!profiler || profiler.length === 0) {
    return { sendt, hoppet, feil }
  }

  // Filtrer i JS på MM-DD. Skuddårsfødte (29.02) i ikke-skuddår
  // gratuleres 01.03 — enklest å detektere ved at vi matcher 03-01
  // og i tillegg sjekker om fødselsdatoen var 29. feb.
  const erSkuddaar = (aar: number) =>
    (aar % 4 === 0 && aar % 100 !== 0) || aar % 400 === 0

  const bursdagsbarn = profiler.filter(p => {
    if (!p.fodselsdato) return false
    const fdato = p.fodselsdato as string // 'YYYY-MM-DD'
    const [, mm, dd] = fdato.split('-')
    const fodselsMmDd = `${mm}-${dd}`

    if (fodselsMmDd === dagStr) return true

    // 29. feb-barn i ikke-skuddår → post 01. mars
    if (
      fodselsMmDd === '02-29' &&
      dagStr === '03-01' &&
      !erSkuddaar(Number(aarStr))
    ) {
      return true
    }

    return false
  })

  if (bursdagsbarn.length === 0) {
    return { sendt, hoppet, feil }
  }

  // 3. Hent alle aktive admins med bursdagsgratulasjon_aktiv = true.
  // rollerMed('kanAdministrere') gir både 'admin' og 'generalsekretaer'.
  // Kolonnen bursdagsgratulasjon_aktiv finnes etter migrasjon 100, men
  // TypeScript kjenner den ikke før typer regenereres — cast via any.
  const { data: avsendere } = await admin
    .from('profiles')
    .select('id, navn')
    .eq('aktiv', true)
    .eq('bursdagsgratulasjon_aktiv' as string, true)
    .in('rolle', rollerMed('kanAdministrere'))

  if (!avsendere || avsendere.length === 0) {
    // Ingen admin har skrudd på toggle — ingenting å gjøre
    return { sendt, hoppet, feil }
  }

  // 4. Behandle hvert bursdagsbarn × hvert avsender-admin
  for (const barn of bursdagsbarn) {
    // varselSendt holder styr på om varselet er sendt for dette barnet allerede
    // — første avsender som lykkes å poste sender varselet, resten poster uten varsel.
    let varselSendt = false

    for (const avsender of avsendere) {
      // En admin gratulerer ikke seg selv (dekker også tilfellet der
      // bursdagsbarnet selv er admin)
      if (avsender.id === barn.id) continue

      const kilde = `bursdag:${barn.id}:${aarStr}:${avsender.id}`

      // Idempotens-sjekk: allerede postet fra denne avsenderen i år?
      // maybeSingle() returnerer null ved 0 rader uten feil — det vanlige tilfellet.
      const { data: eksisterende } = await admin
        .from('klubb_chat')
        .select('id')
        .eq('kilde_ekstern_id', kilde)
        .maybeSingle()

      if (eksisterende) {
        hoppet++
        continue
      }

      // Slot-sannsynlighet: garanterer sending seinest ved siste slot.
      // Formel: P = 1 / (totalSlots - slotIndex). Siste slot → alltid send.
      // Eks. ved 4 slots: slot 0 → 25 %, slot 1 → 33 %, slot 2 → 50 %, slot 3 → 100 %.
      const skalSende =
        slotIndex === totalSlots - 1 ||
        Math.random() < 1 / (totalSlots - slotIndex)

      if (!skalSende) {
        // Utsett til neste slot — telles ikke som hoppet
        continue
      }

      // Bygg melding. visningsnavn er ikke nullable i schema — fornavn er
      // første token. Tekst-variasjon genereres per avsender slik at to
      // posters fra ulike admins ikke er identiske.
      const fornavn = barn.visningsnavn.trim().split(/\s+/)[0]

      const emojis = trekkEmoji(BURSDAG_EMOJI_ANTALL)
      const hilsen = BURSDAG_HILSNER[Math.floor(Math.random() * BURSDAG_HILSNER.length)]
      const utropstegn = BURSDAG_UTROPSTEGN[Math.floor(Math.random() * BURSDAG_UTROPSTEGN.length)]
      const innhold = `${hilsen} med dagen @${fornavn}${utropstegn} ${emojis.join(' ')}`

      try {
        const { error: insertErr } = await admin.from('klubb_chat').insert({
          profil_id: avsender.id,
          innhold,
          kilde_ekstern_id: kilde,
        })

        if (insertErr) {
          // Unique-constraint-brudd = allerede postet (race condition mellom
          // sjekk og insert). Behandles som hoppet, ikke feil.
          if (insertErr.code === '23505') {
            hoppet++
            continue
          }
          console.error('[bursdagsgratulasjon] Insert-feil:', insertErr.message)
          feil++
          continue
        }

        // Send varsel kun fra første avsender som lykkes — bursdagsbarnet
        // skal ikke få N varsler bare fordi N admins har toggle på.
        // Hilsen-teksten i varselet er bevisst fra første vellykkede avsender;
        // ev. senere avsenderes hilsner vises kun i chat, ikke i varselet.
        if (!varselSendt) {
          await sendVarsel({
            mottakere: [barn.id],
            tittel: 'Gratulerer med dagen!',
            melding: `${hilsen} med dagen ${fornavn}`,
            type: 'bursdagsgratulasjon',
            url: '/chat',
          })
          varselSendt = true
        }

        sendt++
      } catch (e) {
        console.error('[bursdagsgratulasjon] Uventet feil:', e)
        feil++
      }
    }
  }

  return { sendt, hoppet, feil }
}
