// Automatisk varsel til «de andre» om at noen har bursdag i dag. Se #638.
//
// Egen kodesti, med vilje. Denne har INGEN kobling til den automatiske
// gratulasjonen i klubbchatten (lib/actions/bursdagsgratulasjon.ts):
// - Kjører uavhengig av `profiles.bursdagsgratulasjon_aktiv` — den kolonnen
//   styrer kun hvilke admins som poster i klubbchatten, og skal ikke arves
//   hit. Er null admins med automatikk påslått, går dette varselet likevel.
// - Kjører uavhengig av om det finnes en chat-post i det hele tatt.
// - Kaller i cron-ruten er innkapslet i hver sin try/catch, så et kast i
//   gratulasjonen ikke river med seg dette varselet (#638-review).
// De to funksjonene deler kun datoregelen (lib/bursdag.ts), ikke noe annet.
//
// E-post: varselet går på alle aktive kanaler, og med ~16 medlemmer betyr det
// opptil ~16 e-poster per bursdagsmorgen. Døgnbudsjettet
// EPOST_DOEGNBUDSJETT_CHAT (70) dekker kun CHAT_BROADCAST_TYPER, så dette
// passerer fritt — samtidig som gratulasjonsposten samme morgen bruker ~16 av
// budsjettet. To bursdager samme dag er derfor ~48 brukt før kl. 09, og et
// chat-varsel på ettermiddagen kan miste e-postkanalen. Bevisst valgt:
// bursdagsvarselet er viktig, og e-post er hver manns eget valg på /profil.
//
// Mottakere: alle aktive medlemmer unntatt bursdagsmannen selv. Ett varsel
// per bursdagsbarn per dag, uansett hvor mange cron-slots som kjører — se
// dedup-resonnementet under.
//
// Ingen `slotIndex`-parameter, i motsetning til bursdagsgratulasjon: denne
// jobben sender ved FØRSTE anledning på alle slots i vinduet i stedet for å
// utsette sannsynlighetsstyrt. Senere slots blir automatisk retry fordi
// `dedupNoekkel` gir 23505 (håndtert i sendVarsel som `dedupHoppet`, ikke
// feil) for mottakere som alt har fått varselet. Dette er doktrinens
// eksplisitt navngitte unntak (CLAUDE.md § Policy: Varsler — «varsel_logg
// kan bære kvitteringen via dedup_noekkel der ingen durabel tilstandsrad
// finnes» — bursdag er akkurat det tilfellet, det finnes ingen egen
// tilstandstabell å stemple `varslet_paa` på). Retry-vinduet er
// selvbegrensende: kun dagens bursdagsbarn, kun de fire slotene denne
// morgenen — i morgen er det en ny dato og en ny dedup-nøkkel.

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

  // 1. Alle aktive profiler — mottakerlista er «alle aktive minus
  // bursdagsbarnet», ikke bare de med kjent fødselsdato, så vi henter uten
  // .not('fodselsdato', 'is', null) her (i motsetning til
  // bursdagsgratulasjon.ts, som kun trenger dem MED fødselsdato).
  const { data: alle, error: profilerFeil } = await admin
    .from('profiles')
    .select('id, navn, fodselsdato')
    .eq('aktiv', true)

  // Fail closed (#504): en svelget feil her ville sett ut som «ingen har
  // bursdag i dag» — umulig å skille fra en reell DB-feil.
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
      // Kun bursdagsbarnet selv er aktiv — ingen «andre» å varsle. Uten denne
      // vakten ville dette logget varsel.mottakere.tomme i lib/varsler.ts
      // fire ganger hver morgen (én per slot).
      hoppet++
      continue
    }

    // Alder er allerede offentlig synlig på BursdagKort på agendaen —
    // gjentas her fordi teksten skal stå på egne ben i innboksen.
    // fodselsdato er garantert satt her: finnBursdagsbarn filtrerer bort
    // profiler uten den.
    const alder = alderIAar(barn.fodselsdato as string, iDag)
    // Fullt `navn`, IKKE `visningsnavn` — samme begrunnelse som chat-taggen i
    // bursdagsgratulasjon.ts: visningsnavn er kallenavnet og i praksis bare
    // fornavnet (mig. 018), og flere medlemmer deler fornavn. «Ola fyller 40 i
    // dag» ville vært tvetydig, og varselet lenker til /chat, ikke til
    // profilen — det finnes ingen annen flate å oppklare på.
    const navn = barn.navn

    try {
      const utfall = await sendVarsel({
        mottakere,
        tittel: 'Bursdag i klubben 🎂',
        melding: `${navn} fyller ${alder} i dag.`,
        url: '/chat',
        type: 'bursdag_i_dag',
        // Navnerom + barn + år, IKKE avsender — dette er ett varsel per
        // bursdagsbarn per år, ikke per admin som gratulerer (i motsetning
        // til bursdagsgratulasjon.ts sin «bursdag-chat:{barn}:{år}:{avsender}»).
        dedupNoekkel: `bursdag_i_dag:${barn.id}:${iDag.split('-')[0]}`,
        // tellerUlest: settes IKKE — default true. Dette er ikke lavsignal
        // som chat-broadcastene; det skal telle mot ulest-prikken/«Viktig».
        //
        // pushTag: settes IKKE, med vilje. Å låne chat-broadcastens tag ville
        // latt en vanlig melding senere på dagen kollapse bursdagsvarselet
        // bort fra låseskjermen (se pushTag-doktrinen i CLAUDE.md).
      })

      // dedupNoekkel er satt ⇒ tillatDuplikat: false (default) beskytter mot
      // duplikat på tvers av slots — ingen varsel.dedup.ingen_noekkel-warn.
      //
      // Tellerne skiller på utfall, ikke bare på om noen ble nådd: «levert 0»
      // er sant både når alle alt har fått varselet og når hele varseltypen er
      // skrudd av. Slått sammen ville cron-JSON-en meldt «hoppet: 1» for en dag
      // der ingen kunne fått noe uansett.
      if (utfall.levert > 0 || utfall.kunApp > 0) {
        varslet++
      } else if (utfall.utfall === 'dedup' || utfall.utfall === 'ingen_mottakere') {
        // dedup: alle hadde alt fått varselet fra et tidligere slot — nettopp
        // slik retry-en er ment å se ut. ingen_mottakere grupperes her fordi
        // det betyr det samme som vakten over: det er ingen å varsle.
        hoppet++
      } else {
        // type_deaktivert (admin har slått av bursdag_i_dag), blokkert_lokal
        // (testmodus) eller hendelse_passert. Ingenting ble sendt, og ingen
        // senere slot vil endre det — men det er ikke en feil.
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
