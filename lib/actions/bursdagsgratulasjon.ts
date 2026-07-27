// Automatisk bursdagsgratulasjon i klubb-chat. Se #328.
//
// Per-admin logikk: alle aktive admins med bursdagsgratulasjon_aktiv = true
// sender én post per bursdagsbarn per år. To admins med toggle på → to poster.
// Idempotens sikres via kilde_ekstern_id = «bursdag:{barnId}:{år}:{adminId}»
// — unik per avsender, slik at begge kan poste uten å slette hverandres.
//
// Varsel til bursdagsbarnet: sendVarsel() sin egen dedup_noekkel
// («bursdag:{barnId}:{år}», mig. 121) er korrektheten her — IKKE en lokal
// variabel. Varselet er flyttet UT av avsender-løkka og sendes én gang per
// barn, EVIG GANG chat-posten finnes (uansett om den ble laget akkurat nå,
// i et tidligere slot, eller av en annen prosess). Før #504 sto varselet
// inni avsender-løkka bak `if (!varselSendt)`, og varselSendt var en lokal
// variabel i én kjøring — når posten allerede fantes fra en tidligere
// kjøring (`eksisterende`/23505-grenen), hoppet koden ALDRI innom
// varsel-koden i det hele tatt («hoppet++; continue»), så et bursdagsbarn
// som fikk posten sin utsatt til et senere slot fikk aldri varselet. Samme
// dedup_noekkel lukker også duplikat-bugen der to admins i to ulike slots
// begge trigget varselet.

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
import { logg } from '@/lib/logg'
import { BASE_URL } from '@/lib/config'
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
  const { data: profiler, error: profilerFeil } = await admin
    .from('profiles')
    .select('id, navn, visningsnavn, fodselsdato')
    .eq('aktiv', true)
    .not('fodselsdato', 'is', null)

  // Fail closed (#504): en svelget feil her ga tidligere samme resultat som
  // «ingen har bursdag i dag» — umulig å skille fra en reell DB-feil.
  if (profilerFeil) {
    await logg.feil('bursdagsgratulasjon.profiler.feilet', profilerFeil)
    feil++
    return { sendt, hoppet, feil }
  }

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
  const { data: avsendere, error: avsendereFeil } = await admin
    .from('profiles')
    .select('id, navn')
    .eq('aktiv', true)
    .eq('bursdagsgratulasjon_aktiv' as string, true)
    .in('rolle', rollerMed('kanAdministrere'))

  // Fail closed (#504): samme resonnement som profiler-oppslaget over.
  if (avsendereFeil) {
    await logg.feil('bursdagsgratulasjon.avsendere.feilet', avsendereFeil)
    feil++
    return { sendt, hoppet, feil }
  }

  if (!avsendere || avsendere.length === 0) {
    // Ingen admin har skrudd på toggle — ingenting å gjøre
    return { sendt, hoppet, feil }
  }

  // 4. Behandle hvert bursdagsbarn × hvert avsender-admin
  for (const barn of bursdagsbarn) {
    // visningsnavn er ikke nullable i schema — fornavn er første token.
    const fornavn = barn.visningsnavn.trim().split(/\s+/)[0]

    // harPost = «finnes det (nå, eller fra før) en chat-post til dette
    // barnet i år?» — settes i alle tre grenene som betyr nettopp det:
    // funnet fra før, fersk insert, eller 23505 (racy dobbel-insert). Styrer
    // om varselet under skal sendes i det hele tatt — vi skal ikke varsle om
    // en gratulasjon som slot-sannsynligheten har utsatt til et senere slot.
    let harPost = false
    // Fanger hilsen fra FØRSTE vellykkede insert i denne kjøringen. Er den
    // fortsatt null når løkka er ferdig (posten fantes alt fra en tidligere
    // kjøring/slot), trekker vi en ny under — vi har ikke den opprinnelige
    // hilsen-teksten liggende noe sted.
    let varselHilsen: string | null = null

    for (const avsender of avsendere) {
      // En admin gratulerer ikke seg selv (dekker også tilfellet der
      // bursdagsbarnet selv er admin)
      if (avsender.id === barn.id) continue

      const kilde = `bursdag:${barn.id}:${aarStr}:${avsender.id}`

      // Idempotens-sjekk: allerede postet fra denne avsenderen i år?
      // maybeSingle() returnerer null ved 0 rader uten feil — det vanlige tilfellet.
      //
      // Bevisst IKKE fail-closed, i motsetning til nabooppslagene i denne filen
      // (#504-review NIT-11): feiler dette oppslaget svelges feilen og vi går
      // videre til insert — som da treffer unique-indeksen på
      // kilde_ekstern_id og gir 23505, håndtert som «alt postet» under. Guarden
      // finnes altså i DB-en, ikke her; å kaste ville stanset resten av
      // bursdagsløkka for en sjekk vi har en hardere versjon av rett etterpå.
      const { data: eksisterende } = await admin
        .from('klubb_chat')
        .select('id')
        .eq('kilde_ekstern_id', kilde)
        .maybeSingle()

      if (eksisterende) {
        hoppet++
        harPost = true
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

      // Tekst-variasjon genereres per avsender slik at to posters fra ulike
      // admins ikke er identiske.
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
            harPost = true
            continue
          }
          await logg.feil('bursdagsgratulasjon.feilet', insertErr, {
            ctx: { code: insertErr.code },
          })
          feil++
          continue
        }

        harPost = true
        if (varselHilsen === null) varselHilsen = hilsen
        sendt++
      } catch (e) {
        await logg.feil('bursdagsgratulasjon.feilet', e)
        feil++
      }
    }

    // Varselet er flyttet UT av avsender-løkka (#504) — selve retry-fiksen.
    // Sendes én gang per barn per år, uansett hvilken avsender/slot som
    // faktisk fikk posten inn. dedup_noekkel («bursdag:{barnId}:{år}», mig.
    // 121) er korrektheten på tvers av prosesser/slots, ikke en lokal
    // variabel — sendVarsel hopper selv over utsendingen til denne
    // mottakeren hvis noekkelen alt er brukt (23505 → tolkes som suksess).
    if (harPost) {
      const hilsenForVarsel =
        varselHilsen ?? BURSDAG_HILSNER[Math.floor(Math.random() * BURSDAG_HILSNER.length)]
      try {
        await sendVarsel({
          mottakere: [barn.id],
          tittel: 'Gratulerer med dagen!',
          melding: `${hilsenForVarsel} med dagen ${fornavn}`,
          type: 'bursdagsgratulasjon',
          url: `${BASE_URL}/chat`,
          dedupNoekkel: `bursdag:${barn.id}:${aarStr}`,
        })
      } catch (e) {
        await logg.feil('bursdagsgratulasjon.varsel.feilet', e, { ctx: { profil_id: barn.id } })
        feil++
      }
    }
  }

  return { sendt, hoppet, feil }
}
