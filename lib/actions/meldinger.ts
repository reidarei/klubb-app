'use server'

import { createServerClient } from '@/lib/supabase/server'
import { ensureInnlogget } from '@/lib/auth'
import { sendVarsel } from '@/lib/varsler'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { BASE_URL } from '@/lib/config'
import { INNLEGG_MAKS_LENGDE, INNLEGG_MIN_LENGDE, MELDING_MAKS_BILDER } from '@/lib/konstanter'
import { naa, erGyldigKalenderdato } from '@/lib/dato'
import { logg } from '@/lib/logg'

export async function opprettMelding(input: {
  innhold: string
  bilde_urls?: string[]
  /** Albumkobling: gjør innlegget til en lenke til et eksisterende album —
   * visningen bruker alltid albumets omslagsbilde (#463). Kan ikke
   * kombineres med egne opplastede bilder — enten/eller. */
  album_id?: string | null
  /** Festedato: innlegget holdes øverst på agenda t.o.m. denne datoen.
   * Format: YYYY-MM-DD. Null = ikke festet. Mig. 109 / #419. */
  aktuell_dato?: string | null
}) {
  const tekst = input.innhold.trim()
  const bilder = (input.bilde_urls ?? []).slice(0, MELDING_MAKS_BILDER)
  const albumId = input.album_id ?? null
  // Valider YYYY-MM-DD-format via erGyldigKalenderdato (se lib/dato.ts) —
  // fanger format-feil, ugyldige verdier og roll-over-datoer i ett kall.
  const kandidatDato = input.aktuell_dato
  const aktuellDato = kandidatDato && erGyldigKalenderdato(kandidatDato) ? kandidatDato : null

  // Albumkobling og egne opplastede bilder utelukker hverandre — UI
  // håndhever det også, men vi avviser her som forsvar i dybden.
  if (albumId && bilder.length > 0) {
    throw new Error('Kan ikke laste opp egne bilder samtidig som du lenker til et album')
  }

  // Hvis det IKKE er en albumkobling: minst enten tekst eller ett bilde kreves.
  // Albumkobling er gyldig uten egen tekst — omslagsbildet og lenken til
  // albumet er innholdet.
  const harAlbum = !!albumId
  if (!harAlbum && bilder.length === 0 && (tekst.length < INNLEGG_MIN_LENGDE || tekst.length > INNLEGG_MAKS_LENGDE)) {
    throw new Error(`Innholdet må være ${INNLEGG_MIN_LENGDE}–${INNLEGG_MAKS_LENGDE} tegn`)
  }
  if ((bilder.length > 0 || harAlbum) && tekst.length > INNLEGG_MAKS_LENGDE) {
    throw new Error(`Innholdet kan maks være ${INNLEGG_MAKS_LENGDE} tegn`)
  }

  const { supabase, user } = await ensureInnlogget()

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
    const { error: bildeErr } = await supabase
      .from('melding_bilder')
      .insert(bildeRader)

    if (bildeErr) {
      // Compensating delete — vi vil ikke ha en tom melding uten bilder
      await supabase.from('meldinger').delete().eq('id', data.id)
      throw new Error(`Bildeopplasting feilet: ${bildeErr.message}`)
    }
  }

  // Varsle alle aktive (utenom forfatter) om nytt innlegg.
  const avsender = await supabase
    .from('profiles')
    .select('navn, visningsnavn')
    .eq('id', user.id)
    .single()

  const avsenderNavn = avsender.data?.visningsnavn ?? avsender.data?.navn ?? 'Noen'
  // Hvis meldingen kun er bilder vises et standardutdrag i stedet for tekst
  const utdrag = tekst
    ? (tekst.length > 80 ? tekst.slice(0, 77) + '...' : tekst)
    : '[delte bilde]'

  sendVarsel({
    tittel: `${avsenderNavn} skrev`,
    melding: utdrag,
    url: `${BASE_URL}/meldinger/${data.id}`,
    knappTekst: 'Åpne innlegget',
    type: 'melding-ny',
  }).catch((err: unknown) => logg.feil('melding.varsler.feilet', err))

  // Uten dette serverer Router Cache den gamle forsiden ved redirect, så det
  // nye innlegget mangler til brukeren refresher manuelt. Alle andre
  // create-actions (arrangementer, poll, album) revaliderer '/' på samme måte.
  revalidatePath('/')
  redirect('/')
}

export async function slettMelding(meldingId: string) {
  const supabase = await createServerClient()
  const { error } = await supabase
    .from('meldinger')
    .delete()
    .eq('id', meldingId)

  if (error) throw new Error(error.message)
}

// Slett ett bilde fra en melding. RLS på melding_bilder kontrollerer hvem
// som får lov (eier via meldinger FK eller admin, og ikke FB-importert —
// se mig. 085). R2-objektet orphanes — dette er bevisst akseptert for
// enkelhetens skyld. Issue #174.
export async function slettMeldingBilde(bildeId: string) {
  const { supabase } = await ensureInnlogget()
  const { error } = await supabase
    .from('melding_bilder')
    .delete()
    .eq('id', bildeId)

  if (error) throw new Error(error.message)
}

// Legg til ett bilde på en eksisterende melding etter publisering — brukes når
// forfatteren vil bytte eller supplere bildet uten å lage nytt innlegg.
// Klienten laster først opp til R2 (lastOppBilde) og sender den ferdige URL-en
// hit. RLS på melding_bilder (mig. 081) tillater kun forfatteren å sette inn;
// vi speiler den sjekken her + FB-frys og album-kobling for tydelig feilmelding
// i stedet for en kryptisk RLS-avvisning.
export async function leggTilMeldingBilde(meldingId: string, bildeUrl: string) {
  const { supabase, user } = await ensureInnlogget()

  const { data: melding, error: meldingFeil } = await supabase
    .from('meldinger')
    .select('profil_id, fra_facebook, album_id')
    .eq('id', meldingId)
    .single()

  if (meldingFeil || !melding) throw new Error('Fant ikke innlegget')
  if (melding.profil_id !== user.id) throw new Error('Du kan bare legge til bilder på egne innlegg')
  if (melding.fra_facebook) throw new Error('Kan ikke endre bilder på Facebook-importerte innlegg')
  // Album-koblede innlegg viser albumets omslag — egne bilder kan ikke
  // kombineres med dem (samme regel som ved opprettelse).
  if (melding.album_id) throw new Error('Album-koblede innlegg bruker albumets bilder')

  // Hent eksisterende bilder for cap-sjekk og for å plassere det nye sist.
  const { data: eksisterende, error: tellFeil } = await supabase
    .from('melding_bilder')
    .select('rekkefoelge')
    .eq('melding_id', meldingId)

  if (tellFeil) throw new Error(tellFeil.message)
  if ((eksisterende?.length ?? 0) >= MELDING_MAKS_BILDER) {
    throw new Error(`Maks ${MELDING_MAKS_BILDER} bilder per innlegg`)
  }
  // Nytt bilde legges bakerst: høyeste eksisterende rekkefoelge + 1 (−1 som
  // start gjør at første bilde på et tomt innlegg får rekkefoelge 0).
  const nesteRekkefoelge =
    (eksisterende ?? []).reduce((maks, r) => Math.max(maks, r.rekkefoelge), -1) + 1

  const { error } = await supabase
    .from('melding_bilder')
    .insert({ melding_id: meldingId, bilde_url: bildeUrl, rekkefoelge: nesteRekkefoelge })

  if (error) throw new Error(error.message)
  // Innlegget vises også på forsiden med omslagsbilde — revalider så feeden
  // fanger det nye/endrede bildet, ikke bare detaljsiden (router.refresh).
  revalidatePath('/')
}

export async function oppdaterMeldingPost(meldingId: string, innhold: string) {
  const tekst = innhold.trim()
  if (tekst.length < INNLEGG_MIN_LENGDE || tekst.length > INNLEGG_MAKS_LENGDE) {
    throw new Error(`Innholdet må være ${INNLEGG_MIN_LENGDE}–${INNLEGG_MAKS_LENGDE} tegn`)
  }
  const supabase = await createServerClient()
  const { error } = await supabase
    .from('meldinger')
    .update({ innhold: tekst })
    .eq('id', meldingId)

  if (error) throw new Error(error.message)
}

// Reaksjoner på selve innlegget. Egen tabell `melding_reaksjon` for å
// holde dem adskilt fra chat_reaksjoner som er på kommentar-nivå.
// Bytte av reaksjon som delete+insert, ikke upsert (#472): UPDATE er verken
// grantet eller RLS-tillatt på tabellen. Konsumenten her (useMeldingReaksjoner
// i lib/reaksjoner-hook.ts) re-henter via router.refresh() etter mutasjonen —
// den lytter ikke på realtime. Vi holder likevel delete+insert-mønsteret
// konsistent med chat-flaten (leggTilReaksjon i chat.ts), som ER realtime og
// trenger separate DELETE- og INSERT-events for at useChatReaksjoner skal
// oppdatere riktig. Delete UTEN emoji-filter fjerner brukerens eventuelle
// andre emoji på meldingen, slik at ny emoji faktisk bytter i stedet for å
// legge seg ved siden av. Unik-constrainten fra mig. 114 er sikkerhetsnett
// mot racet der to raske bytter fra samme bruker treffer nesten samtidig.
export async function leggTilMeldingReaksjon(meldingId: string, emoji: string) {
  const { supabase, user } = await ensureInnlogget()

  const { error: sletteFeil } = await supabase
    .from('melding_reaksjon')
    .delete()
    .eq('melding_id', meldingId)
    .eq('profil_id', user.id)

  if (sletteFeil) throw new Error(sletteFeil.message)

  const { error: innsettingFeil } = await supabase
    .from('melding_reaksjon')
    .insert({ melding_id: meldingId, profil_id: user.id, emoji })

  if (innsettingFeil) throw new Error(innsettingFeil.message)
}

export async function fjernMeldingReaksjon(meldingId: string, emoji: string) {
  const { supabase, user } = await ensureInnlogget()

  const { error } = await supabase
    .from('melding_reaksjon')
    .delete()
    .eq('melding_id', meldingId)
    .eq('profil_id', user.id)
    .eq('emoji', emoji)

  if (error) throw new Error(error.message)
}

// Arkiver et innlegg — flytt det umiddelbart til Tidligere-seksjonen uten
// å vente på tidsvinduet. RLS-policyen på meldinger (mig. 067) håndhever hvem
// som får lov: «(fra_facebook is null or false) and (profil_id = auth.uid()
// or er_admin())» — FB-importerte innlegg kan derfor ikke arkiveres. Mig. 099.
export async function arkiverMelding(meldingId: string) {
  const { supabase } = await ensureInnlogget()

  const { error } = await supabase
    .from('meldinger')
    .update({ arkivert_tidspunkt: naa() })
    .eq('id', meldingId)

  if (error) throw new Error(error.message)
  revalidatePath('/')
}

// Reverter arkivering — sender innlegget tilbake til levende-seksjonen.
// Bumper også sist_aktivitet: uten det ville innlegg eldre enn
// MELDING_LEVENDE_DAGER falt rett tilbake i Tidligere (eller vært en no-op
// hvis de aldri var arkivert, bare «falt ned» naturlig). Innlegget får dermed
// en fersk levende-periode, som om det var nytt. Samme RLS som arkiverMelding.
export async function avarkiverMelding(meldingId: string) {
  const { supabase } = await ensureInnlogget()

  const { error } = await supabase
    .from('meldinger')
    .update({ arkivert_tidspunkt: null, sist_aktivitet: naa() })
    .eq('id', meldingId)

  if (error) throw new Error(error.message)
  revalidatePath('/')
}
