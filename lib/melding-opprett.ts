// Server-only kjerne for å opprette et innlegg + varsle klubben. Flyttet ut
// av lib/actions/meldinger.ts (#785) slik at fondsrapport-publiseringen
// (lib/actions/fondsrapport.ts) kan gjenbruke nøyaktig samme insert- og
// varsel-logikk som et vanlig innlegg — IKKE 'use server': dette er ikke en
// egen server action, bare en delt funksjon kalt FRA server actions. En
// 'use server'-fil kan kun eksportere async-funksjoner ment å kalles fra
// klienten, og denne skal aldri kunne kalles direkte derfra.
import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import { sendVarsel } from '@/lib/varsler'
import { BASE_URL } from '@/lib/config'
import { logg } from '@/lib/logg'

type OpprettInnleggInput = {
  supabase: SupabaseClient
  user: User
  tekst: string
  bilder: string[]
  albumId: string | null
  aktuellDato: string | null
  /** Overstyrer standard-utdraget («…tekst…» / «[delte bilde]») i varselteksten
   * — brukt av fondsrapporten, der utdraget skal si «Fondsrapport Q3 2026»
   * fremfor de første tegnene av hilsenen (som kan være tom). */
  varselUtdrag?: string
}

/**
 * Sett inn et innlegg i meldinger (+ ev. bilder) og varsle klubben. Delt
 * kjerne for opprettMelding (lib/actions/meldinger.ts) og
 * publiserFondsrapport (lib/actions/fondsrapport.ts) — se filhode.
 *
 * Kalleren eier all validering (tegngrenser, album-vs-bilder-utelukkelse
 * osv.) FØR dette kalles — denne funksjonen validerer ikke selv.
 */
export async function opprettInnleggOgVarsle({
  supabase,
  user,
  tekst,
  bilder,
  albumId,
  aktuellDato,
  varselUtdrag,
}: OpprettInnleggInput): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('meldinger')
    .insert({
      profil_id: user.id,
      // Null-innhold er OK når bildet bærer innlegget
      innhold: tekst || null,
      album_id: albumId,
      aktuell_dato: aktuellDato,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('Klarte ikke å opprette innlegget')

  // Sett inn bilder i melding_bilder. Hvis dette feiler, slett meldingen
  // slik at vi ikke etterlater en tom rad i feeden (best-effort cleanup).
  if (bilder.length > 0) {
    const bildeRader = bilder.map((url, i) => ({
      melding_id: data.id,
      bilde_url: url,
      rekkefoelge: i,
    }))
    const { error: bildeErr } = await supabase.from('melding_bilder').insert(bildeRader)

    if (bildeErr) {
      // Compensating delete — vi vil ikke ha en tom melding uten bilder. Logg
      // feiler den også, men kast den opprinnelige bildeErr videre (#760).
      const { error: opprydFeil } = await supabase.from('meldinger').delete().eq('id', data.id)
      if (opprydFeil) {
        await logg.feil('melding.opprett.opprydding.feilet', opprydFeil, {
          ctx: { code: opprydFeil.code, sample: data.id },
        })
      }
      throw new Error(`Bildeopplasting feilet: ${bildeErr.message}`)
    }
  }

  // Varsle alle aktive (utenom forfatter) om nytt innlegg.
  // maybeSingle + eksplisitt error: med .single() rapporterer PostgREST 0 rader
  // som error PGRST116 og lar data være null — leses ikke feilen, faller vi
  // stille tilbake på «Noen skrev» i stedet for navnet. Se CLAUDE.md
  // § Policy: Databasespørringer.
  const { data: avsender, error: avsenderFeil } = await supabase
    .from('profiles')
    .select('navn, visningsnavn')
    .eq('id', user.id)
    .maybeSingle()

  // Navneoppslaget skal ikke velte et innlegg som allerede er lagret — vi
  // logger og bruker fallbacken, men da vet vi i det minste hvorfor.
  if (avsenderFeil) {
    await logg.feil('melding.avsendernavn.feilet', avsenderFeil, {
      ctx: { profil_id: user.id, code: avsenderFeil.code },
    })
  }

  const avsenderNavn = avsender?.visningsnavn ?? avsender?.navn ?? 'Noen'
  // Hvis meldingen kun er bilder vises et standardutdrag i stedet for tekst.
  // varselUtdrag overstyrer begge (fondsrapporten).
  const utdrag =
    varselUtdrag ?? (tekst ? (tekst.length > 80 ? tekst.slice(0, 77) + '...' : tekst) : '[delte bilde]')

  sendVarsel({
    tittel: `${avsenderNavn} skrev`,
    melding: utdrag,
    url: `${BASE_URL}/meldinger/${data.id}`,
    knappTekst: 'Åpne innlegget',
    type: 'melding-ny',
    // Bærer verken arrangementId, pollId eller dedupNoekkel — default
    // tillatDuplikat: false var derfor en no-op (samme felle som #518,
    // funnet under det arbeidet). Ingen retry-mekanisme kaller dette
    // stedet i dag, så tillatDuplikat: true sier bare sannheten om
    // oppførselen som allerede fantes.
    tillatDuplikat: true,
  }).catch((err: unknown) => logg.feil('melding.varsler.feilet', err))

  return { id: data.id }
}
