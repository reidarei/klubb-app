// Automatisk bursdagsgratulasjon i klubb-chat. Se #328.
//
// Per-admin logikk: alle aktive admins med bursdagsgratulasjon_aktiv = true
// sender én post per bursdagsbarn per år. To admins med toggle på → to poster.
// Idempotens sikres via kilde_ekstern_id = «bursdag:{barnId}:{år}:{adminId}»
// — unik per avsender, slik at begge kan poste uten å slette hverandres.
//
// Chat-varsel (#642, revidert #643): en menneskeskrevet chat-post går gjennom
// sendChatVarsler() (kalt fra lib/actions/chat.ts) — den automatiske
// gratulasjonen gjorde det ikke, så ingen fikk varsel om ny melding og
// taggen (@navn) utløste ikke mention. Fiksen kaller sendChatVarsler() én gang
// per avsender, sist i hver avsender-iterasjon (inne i løkka, ikke etter den),
// med en per-avsender dedup-nøkkel
// («bursdag-chat:{barnId}:{år}:{avsenderId}»). Retry-en er dedup_noekkel,
// ikke en lokal variabel (#504-lærdommen, som opprinnelig gjaldt et eget
// dedikert varsel fjernet i #643): kallet gjentas på hvert slot der posten
// finnes (fersk ELLER fra et tidligere slot), og retry-vinduet er
// selvbegrensende — kun dagens bursdagsbarn, kun de fire slotene denne
// morgenen. Var det dedikerte varselet fortsatt her, ville dette vært
// nøyaktig samme bug-klasse: en lokal variabel i én kjøring ville aldri sett
// en post som allerede fantes fra en tidligere kjøring.
//
// Det dedikerte varselet («Gratulerer med dagen! 🎉» til bursdagsbarnet) er
// FJERNET i #643: mention-varselet fra sendChatVarsler() over dekker samme
// behov, og å beholde begge ga bursdagsmannen to varsler om nøyaktig samme
// gratulasjon i samme minutt. Typen `bursdagsgratulasjon` sendes ikke lenger,
// men etiketten i lib/varsel-typer.ts må stå — historiske varsel_logg-rader
// fra før #643 skal fortsatt vises med navn, ikke som rå nøkkel.
//
// To konsekvenser av at mention-varselet nå står alene:
// 1. sendChatVarsler() svelger begge benene sine (chat.varsler.mention.feilet /
//    chat.varsler.broadcast.feilet) og kaster kun på profiles-oppslaget. Feiler
//    mention-sendingen, teller verken `feil` eller vår egen
//    bursdagsgratulasjon.chatvarsel.feilet — sporet er da KUN det generiske
//    mention-eventet, og cronen svarer 200. Feiler den på siste slot, får
//    bursdagsmannen ingenting.
// 2. Varselet henger nå på mention-bryteren i varsel_innstillinger («@-mention
//    i chat» på /innstillinger), som typen aldri gjorde før. Skrus den av,
//    returnerer mention-benet type_deaktivert og de nevnte legges tilbake i
//    broadcasten — som er tellerUlest: false, så et medlem på
//    varsel_nivaa = 'viktige' mister push/e-post for sin egen gratulasjon.
//
// Taggen bruker fullt navn (`profiles.navn`), IKKE `visningsnavn`
// (#642-oppfølging): visningsnavn er kallenavnet, og er i praksis fornavnet —
// migrasjon 018 seedet kolonnen med `split_part(navn, ' ', 1)`. Flere medlemmer
// i klubben deler fornavn, og finnNevnte()s tekstmatching ville truffet ALLE
// profiler med det fornavnet. `navn` er dessuten nøyaktig det mention-velgeren
// setter inn når et menneske tagger, så posten blir ikke til å skille fra en
// håndskrevet. Cronen kjenner uansett mottakerens id og trenger ikke gjette —
// `opts.nevnte` (sendChatVarsler) gir eksplisitt mention-mottaker uavhengig av
// tagg-teksten.

import { iDagOslo } from '@/lib/dato'
import { finnBursdagsbarn } from '@/lib/bursdag'
import {
  BURSDAG_EMOJI_POOL,
  BURSDAG_EMOJI_ANTALL,
  BURSDAG_HILSNER,
  BURSDAG_UTROPSTEGN,
} from '@/lib/konstanter'
import { sendChatVarsler } from '@/lib/varsler'
import { rollerMed } from '@/lib/roller'
import { logg } from '@/lib/logg'
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

  // 1. Finn dagens dato (norsk tid) som "YYYY-MM-DD"
  const iDag = iDagOslo()
  const aarStr = iDag.split('-')[0]

  // 2. Hent aktive profiler med fødselsdato
  // Kun id, navn, fodselsdato — visningsnavn har ingen bruker igjen etter at
  // det dedikerte varselet (som brukte kallenavnet i teksten) ble fjernet i
  // #643. Chat-taggen bruker fullt `navn`, se kommentaren i filhodet.
  const { data: profiler, error: profilerFeil } = await admin
    .from('profiles')
    .select('id, navn, fodselsdato')
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

  // Skuddårsregelen (29.02-barn gratuleres 01.03 i ikke-skuddår) er delt med
  // lib/actions/bursdagsvarsel.ts via lib/bursdag.ts — se filhode der for
  // hvorfor kun datoregelen deles, ikke selve varslingen (#638).
  const bursdagsbarn = finnBursdagsbarn(profiler, iDag)

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
    for (const avsender of avsendere) {
      // En admin gratulerer ikke seg selv (dekker også tilfellet der
      // bursdagsbarnet selv er admin)
      if (avsender.id === barn.id) continue

      const kilde = `bursdag:${barn.id}:${aarStr}:${avsender.id}`

      // Innholdet av chat-posten denne iterasjonen faktisk endte opp med
      // (fersk eller fra før) — null betyr «ingen post fra denne avsenderen
      // (ennå)», og styrer om vi kaller sendChatVarsler() nedenfor.
      let postetInnhold: string | null = null

      // Idempotens-sjekk: allerede postet fra denne avsenderen i år?
      // maybeSingle() returnerer null ved 0 rader uten feil — det vanlige tilfellet.
      //
      // Bevisst IKKE fail-closed, i motsetning til nabooppslagene i denne filen
      // (#504-review NIT-11): feiler dette oppslaget svelges feilen og vi går
      // videre til insert — som da treffer unique-indeksen på
      // kilde_ekstern_id og gir 23505, håndtert som «alt postet» under. Guarden
      // finnes altså i DB-en, ikke her; å kaste ville stanset resten av
      // bursdagsløkka for en sjekk vi har en hardere versjon av rett etterpå.
      // eslint-disable-next-line hk/supabase-feil-maa-hentes -- bevisst fail-open: unique-constraint klubb_chat_kilde_ekstern_id_unique (migrasjon 066) fanger den tapte grenen via 23505 rett under (#504)
      const { data: eksisterende } = await admin
        .from('klubb_chat')
        .select('id, innhold')
        .eq('kilde_ekstern_id', kilde)
        .maybeSingle()

      if (eksisterende) {
        hoppet++
        postetInnhold = eksisterende.innhold
      } else {
        // Slot-sannsynlighet: garanterer sending seinest ved siste slot.
        // Formel: P = 1 / (totalSlots - slotIndex). Siste slot → alltid send.
        // Eks. ved 4 slots: slot 0 → 25 %, slot 1 → 33 %, slot 2 → 50 %, slot 3 → 100 %.
        const skalSende =
          slotIndex === totalSlots - 1 ||
          Math.random() < 1 / (totalSlots - slotIndex)

        if (!skalSende) {
          // Utsett til neste slot — telles ikke som hoppet, og en utsatt post
          // skal ikke varsle om noe som ikke finnes ennå.
          continue
        }

        // Tekst-variasjon genereres per avsender slik at to posters fra ulike
        // admins ikke er identiske.
        const emojis = trekkEmoji(BURSDAG_EMOJI_ANTALL)
        const hilsen = BURSDAG_HILSNER[Math.floor(Math.random() * BURSDAG_HILSNER.length)]
        const utropstegn = BURSDAG_UTROPSTEGN[Math.floor(Math.random() * BURSDAG_UTROPSTEGN.length)]
        // Fullt `navn` i taggen — IKKE `visningsnavn`, som er kallenavnet og
        // i praksis bare fornavnet (mig. 018). Flere medlemmer deler fornavn,
        // så en tagg på kallenavnet ville pekt tvetydig på flere profiler.
        // mentionSplitRegex tillater mellomrom, så «@Ola Nordmann» rendres
        // som én sammenhengende tagg i chatten.
        const innhold = `${hilsen} med dagen @${barn.navn}${utropstegn} ${emojis.join(' ')}`

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
              // Fail-open, uten vakt (#504-review NIT-11-resonnementet over
              // gjelder likt her): den andre prosessen vant racet og har alt
              // skrevet posten, så et nytt oppslag henter DENS tekst. Feiler
              // dette oppslaget, faller vi tilbake på vår egen lokale
              // `innhold` — verste utfall er at chat-varselets utdrag har en
              // annen hilsen/emoji enn den faktiske chat-posten, ikke at
              // varselet uteblir.
              // eslint-disable-next-line hk/supabase-feil-maa-hentes -- fail-open: verste utfall er en litt annen hilsen i varsel-utdraget enn selve posten, se kommentar over
              const { data: vunnetAv } = await admin
                .from('klubb_chat')
                .select('innhold')
                .eq('kilde_ekstern_id', kilde)
                .maybeSingle()
              postetInnhold = vunnetAv?.innhold ?? innhold
            } else {
              await logg.feil('bursdagsgratulasjon.feilet', insertErr, {
                ctx: { code: insertErr.code },
              })
              feil++
              continue
            }
          } else {
            sendt++
            postetInnhold = innhold
          }
        } catch (e) {
          await logg.feil('bursdagsgratulasjon.feilet', e)
          feil++
          continue
        }
      }

      // Chat-varsel (#642): samme inngangsport som en menneskeskrevet post
      // (lib/actions/chat.ts) — utløser broadcast til alle aktive medlemmer
      // OG et ekte mention-varsel til bursdagsbarnet. Mottakeren av mention-en
      // kommer fra `opts.nevnte` (barnets id), ikke fra tagg-teksten — teksten
      // er fortsatt en ekte @-tagg for lesbarhet, men den gjettes ikke på.
      // Kalles for HVER avsender — to admins som poster hver sin gratulasjon
      // skal gi to chat-varsler, akkurat som om to menn hadde skrevet hver
      // sin melding for hånd. Dette er nå ENESTE varsel til bursdagsbarnet
      // (#643 — det tidligere separate «Gratulerer med dagen!»-varselet er
      // fjernet, se filhodet), så dedup_noekkel («bursdag-chat:{barnId}:
      // {år}:{avsenderId}», per (barn, år, avsender)) er retry-korrektheten
      // fra #504-lærdommen: samme nøkkel hver gang dette slotet kjøres for
      // denne posten, så retry fra et senere slot ikke varsler på nytt.
      if (postetInnhold) {
        try {
          await sendChatVarsler({ type: 'klubb' }, postetInnhold, avsender.id, false, {
            dedupNoekkel: `bursdag-chat:${barn.id}:${aarStr}:${avsender.id}`,
            nevnte: [barn.id],
          })
        } catch (e) {
          await logg.feil('bursdagsgratulasjon.chatvarsel.feilet', e, {
            ctx: { profil_id: barn.id },
          })
          feil++
        }
      }
    }
  }

  return { sendt, hoppet, feil }
}
