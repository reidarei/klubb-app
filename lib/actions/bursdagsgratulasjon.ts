// Automatisk bursdagsgratulasjon i klubb-chat (#328).
//
// Hver aktive admin med bursdagsgratulasjon_aktiv poster én gang per
// bursdagsbarn per år. kilde_ekstern_id «bursdag:{barnId}:{år}:{adminId}» er
// unik per avsender, så flere admins kan poste hver sin.
//
// Chat-varsel (#642/#643): sendChatVarsler() kalles per avsender, inne i
// løkka, også når posten er fra et tidligere slot. Retry-sikkerheten ligger i
// dedup_noekkel «bursdag-chat:{barnId}:{år}:{avsenderId}», ikke i en lokal
// variabel (#504). Mention-varselet er eneste varsel til bursdagsbarnet — det
// egne «Gratulerer med dagen»-varselet ble fjernet i #643.
//
// Konsekvenser av det:
// 1. sendChatVarsler() svelger feil i begge benene; feiler mention-sendingen,
//    er eneste spor chat.varsler.mention.feilet, og cronen svarer 200.
// 2. Varselet følger mention-bryteren. Er den av, havner barnet i broadcasten
//    (lavsignal), og på varsel_nivaa 'viktige' mister han push/e-post for sin
//    egen gratulasjon.
//
// Taggen bruker fullt `navn`, ikke `visningsnavn` (i praksis fornavnet, mig.
// 018) — flere deler fornavn. Mottakeren gis uansett eksplisitt via
// `opts.nevnte`, ikke via tagg-teksten.

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

// N unike emoji via Fisher-Yates. Math.random() holder — ikke et kryptokrav.
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

  const iDag = iDagOslo()
  const aarStr = iDag.split('-')[0]

  const { data: profiler, error: profilerFeil } = await admin
    .from('profiles')
    .select('id, navn, fodselsdato')
    .eq('aktiv', true)
    .not('fodselsdato', 'is', null)

  // Fail closed: feil ≠ «ingen har bursdag i dag» (#504).
  if (profilerFeil) {
    await logg.feil('bursdagsgratulasjon.profiler.feilet', profilerFeil)
    feil++
    return { sendt, hoppet, feil }
  }

  if (!profiler || profiler.length === 0) {
    return { sendt, hoppet, feil }
  }

  // Skuddårsregelen (29.02 → 01.03 i ikke-skuddår) deles med bursdagsvarsel.ts.
  const bursdagsbarn = finnBursdagsbarn(profiler, iDag)

  if (bursdagsbarn.length === 0) {
    return { sendt, hoppet, feil }
  }

  const { data: avsendere, error: avsendereFeil } = await admin
    .from('profiles')
    .select('id, navn')
    .eq('aktiv', true)
    .eq('bursdagsgratulasjon_aktiv', true)
    .in('rolle', rollerMed('kanAdministrere'))

  // Fail closed, som over.
  if (avsendereFeil) {
    await logg.feil('bursdagsgratulasjon.avsendere.feilet', avsendereFeil)
    feil++
    return { sendt, hoppet, feil }
  }

  if (!avsendere || avsendere.length === 0) {
    return { sendt, hoppet, feil }
  }

  for (const barn of bursdagsbarn) {
    for (const avsender of avsendere) {
      // En admin gratulerer ikke seg selv.
      if (avsender.id === barn.id) continue

      const kilde = `bursdag:${barn.id}:${aarStr}:${avsender.id}`

      // Postens tekst (fersk eller fra før); null = ingen post ennå, ikke varsle.
      let postetInnhold: string | null = null

      // Fail-open med vilje: unique-indeksen på kilde_ekstern_id er den egentlige
      // guarden (23505 under). Å kaste ville stanset resten av løkka.
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
        // P = 1 / (totalSlots - slotIndex) gir jevn fordeling over slotene og
        // garantert sending på siste (4 slots: 25 %, 33 %, 50 %, 100 %).
        const skalSende =
          slotIndex === totalSlots - 1 ||
          Math.random() < 1 / (totalSlots - slotIndex)

        if (!skalSende) {
          // Utsatt: telles ikke som hoppet, og ingen post å varsle om.
          continue
        }

        // Variasjon per avsender, så to admins' poster ikke blir like.
        const emojis = trekkEmoji(BURSDAG_EMOJI_ANTALL)
        const hilsen = BURSDAG_HILSNER[Math.floor(Math.random() * BURSDAG_HILSNER.length)]
        const utropstegn = BURSDAG_UTROPSTEGN[Math.floor(Math.random() * BURSDAG_UTROPSTEGN.length)]
        // Fullt `navn` (se filhodet); splittPaaMentions rendrer det som én tagg.
        const innhold = `${hilsen} med dagen @${barn.navn}${utropstegn} ${emojis.join(' ')}`

        try {
          const { error: insertErr } = await admin.from('klubb_chat').insert({
            profil_id: avsender.id,
            innhold,
            kilde_ekstern_id: kilde,
          })

          if (insertErr) {
            // 23505 = en annen kjøring vant racet (race condition: to kjøringer
            // mellom sjekk og insert). Hoppet, ikke feil.
            if (insertErr.code === '23505') {
              hoppet++
              // Hent vinnerens tekst; feiler det, brukes vår egen — verste
              // utfall er et litt annet utdrag i varselet.
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

      // Samme inngangsport som en håndskrevet post (#642): broadcast + mention
      // til barnet. Per avsender, som om to menn skrev hver sin melding.
      // dedup_noekkel gjør retry fra senere slot trygt — se filhodet.
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
