'use server'

import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { sendChatMentionVarsler, sendVarsel } from '@/lib/varsler'
import { BASE_URL } from '@/lib/config'
import { CHAT_MIN_LENGDE, INNLEGG_MIN_LENGDE } from '@/lib/konstanter'
import { konfigFor, revalideringsPaths, type ChatScope } from '@/lib/chat-konfig'
import { ensureInnlogget } from '@/lib/auth'

// Trimmer og validerer chat-innhold for et gitt scope. Bruker scope-spesifikk
// charLimit (privat = INNLEGG_MAKS_LENGDE = 2000, øvrige = CHAT_MAKS_LENGDE
// = 500). Tekst kan være tom hvis bilde_url er satt — meldingen kan være
// ren bilde. Returnerer trimmed tekst (eller null hvis tom).
function validerInnhold(
  innhold: string | null,
  bildeUrl: string | null,
  charLimit: number,
): { tekst: string | null } {
  const tekst = innhold?.trim() || null
  if (!tekst && !bildeUrl) {
    throw new Error('Meldingen må ha tekst eller bilde')
  }
  // Privat har egen min via INNLEGG_MIN_LENGDE; for chat er CHAT_MIN_LENGDE
  // det riktige. Begge er 1, så vi velger basert på charLimit-størrelsen.
  const minLengde = charLimit > 500 ? INNLEGG_MIN_LENGDE : CHAT_MIN_LENGDE
  if (tekst && (tekst.length < minLengde || tekst.length > charLimit)) {
    throw new Error(`Meldingen må være ${minLengde}–${charLimit} tegn`)
  }
  return { tekst }
}

// Etter vellykket insert: send mention- eller privat-melding-varsel.
// For arrangement/klubb/poll/melding: skanner teksten etter @-mentions og
// varsler bare de mottakerne. For privat: én varsel til motparten.
async function sendVarslerEtterPost(
  scope: ChatScope,
  tekst: string | null,
  avsenderId: string,
  bildeUrl: string | null = null,
): Promise<void> {
  if (scope.type === 'privat') {
    // Defensiv — validerInnhold skal ha kastet før vi når denne grenen uten
    // tekst eller bilde, men vi beholder fallback for trygghet.
    const varselTekst =
      tekst ?? (bildeUrl ? '📷 Sendte deg et bilde' : 'Sendte deg en melding')
    await sendPrivatMeldingVarsel(scope.samtaleId, varselTekst, avsenderId)
    return
  }
  if (!tekst) return
  // @-mention-varsler MÅ awaites — fire-and-forget kuttes av Vercel
  // når server action returnerer (CLAUDE.md: «Bruk aldri after()…
  // Bruk await direkte»). Promise.all internt gjør utsendingen
  // parallell, så latency er kort selv med mange mottakere.
  if (scope.type === 'arrangement') {
    await sendChatMentionVarsler({ type: 'arrangement', id: scope.arrangementId }, tekst, avsenderId)
  } else if (scope.type === 'klubb') {
    await sendChatMentionVarsler({ type: 'klubb' }, tekst, avsenderId)
  } else if (scope.type === 'poll') {
    await sendChatMentionVarsler({ type: 'poll', id: scope.pollId }, tekst, avsenderId)
  } else if (scope.type === 'melding') {
    await sendChatMentionVarsler({ type: 'melding', id: scope.meldingId }, tekst, avsenderId)
  }
}

async function sendPrivatMeldingVarsel(
  samtaleId: string,
  tekst: string,
  avsenderId: string,
): Promise<void> {
  const supabase = await createServerClient()

  const { data: samtale } = await supabase
    .from('samtale')
    .select('profil_a, profil_b')
    .eq('id', samtaleId)
    .single()

  if (!samtale) return

  const motpartId = samtale.profil_a === avsenderId ? samtale.profil_b : samtale.profil_a

  const { data: avsender } = await supabase
    .from('profiles')
    .select('navn, visningsnavn')
    .eq('id', avsenderId)
    .single()

  const avsenderNavn = avsender?.visningsnavn ?? avsender?.navn ?? 'Noen'
  const utdrag = tekst.length > 80 ? tekst.slice(0, 77) + '...' : tekst

  // Hver privatmelding er sin egen — tillatDuplikat: true så samme avsender
  // kan sende flere meldinger uten at de filtreres bort i dedup-laget.
  await sendVarsel({
    mottakere: [motpartId],
    tittel: `${avsenderNavn} skrev`,
    melding: utdrag,
    url: `${BASE_URL}/samtaler/${samtaleId}`,
    knappTekst: 'Åpne samtalen',
    type: 'privat-melding',
    tillatDuplikat: true,
  })
}

// Generisk send for alle chat-scopes. Tabell, FK-felt og charLimit slås opp
// i CHAT_KONFIG. RLS i Postgres er fortsatt det som faktisk håndhever
// tilgang per scope; her gjør vi bare ergonomisk innsetting.
export async function sendChatMelding(
  scope: ChatScope,
  innhold: string | null,
  bildeUrl: string | null = null,
): Promise<void> {
  const k = konfigFor(scope)
  const { tekst } = validerInnhold(innhold, bildeUrl, k.charLimit)

  const { supabase, user } = await ensureInnlogget()

  const fkData = k.fkFelt ? { [k.fkFelt]: k.scopeId(scope) } : {}
  const { error } = await supabase
    .from(k.tabell)
    .insert({
      ...fkData,
      profil_id: user.id,
      innhold: tekst,
      bilde_url: bildeUrl,
    })
  if (error) throw new Error(error.message)

  revalideringsPaths(scope).forEach((p) => revalidatePath(p))

  try {
    await sendVarslerEtterPost(scope, tekst, user.id, bildeUrl)
  } catch (err) {
    // Varsel-svikt skal ikke feile selve meldingen — den er allerede skrevet
    // til DB. Logg og gå videre.
    console.error('post-send-varsler feilet:', err)
  }
}

export async function oppdaterChatMelding(
  scope: ChatScope,
  meldingId: string,
  innhold: string,
): Promise<void> {
  const k = konfigFor(scope)
  // Ved redigering kreves alltid tekst — dummy bildeUrl for å passere bilde-
  // fallbacken i validerInnhold. Bilde kan ikke endres via redigering.
  // Eksplisitt sjekk for tom/whitespace etter trim siden validerInnhold med
  // bildeUrl='placeholder' ellers ville la null-tekst slippe gjennom og
  // nulle ut innhold-kolonnen i DB.
  const { tekst } = validerInnhold(innhold, 'placeholder', k.charLimit)
  if (!tekst) {
    const minLengde = k.charLimit > 500 ? INNLEGG_MIN_LENGDE : CHAT_MIN_LENGDE
    throw new Error(`Meldingen må være ${minLengde}–${k.charLimit} tegn`)
  }

  const supabase = await createServerClient()
  const { error } = await supabase
    .from(k.tabell)
    .update({ innhold: tekst })
    .eq('id', meldingId)

  if (error) throw new Error(error.message)

  revalideringsPaths(scope).forEach((p) => revalidatePath(p))
}

export async function slettChatMelding(
  scope: ChatScope,
  meldingId: string,
): Promise<void> {
  const k = konfigFor(scope)
  const supabase = await createServerClient()
  const { error } = await supabase
    .from(k.tabell)
    .delete()
    .eq('id', meldingId)

  if (error) throw new Error(error.message)

  revalideringsPaths(scope).forEach((p) => revalidatePath(p))
}

// Reaksjoner — felles for alle scopes via chat_reaksjoner-tabellen.
// melding_id peker til id-en i den underliggende chat-tabellen (RLS
// håndhever at brukeren kun kan legge til/fjerne egne reaksjoner).
export async function leggTilReaksjon(meldingId: string, emoji: string) {
  const { supabase, user } = await ensureInnlogget()

  const { error } = await supabase
    .from('chat_reaksjoner')
    .upsert(
      { melding_id: meldingId, profil_id: user.id, emoji },
      { onConflict: 'melding_id,profil_id,emoji' },
    )

  if (error) throw new Error(error.message)
}

export async function fjernReaksjon(meldingId: string, emoji: string) {
  const { supabase, user } = await ensureInnlogget()

  const { error } = await supabase
    .from('chat_reaksjoner')
    .delete()
    .eq('melding_id', meldingId)
    .eq('profil_id', user.id)
    .eq('emoji', emoji)

  if (error) throw new Error(error.message)
}
