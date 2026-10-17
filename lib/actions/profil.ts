'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { ensureAdmin, ensureInnlogget } from '@/lib/auth'
import { naa } from '@/lib/dato'
import { normaliserTelefon } from '@/lib/telefon'
import { normaliserFritekst } from '@/lib/fritekst'
import { MATALLERGIER_MAKS_LENGDE, STIKKORD_MAKS_LENGDE } from '@/lib/konstanter'
import { logg } from '@/lib/logg'

// Resultattyper for GS-actions — strukturert retur i stedet for throw,
// slik at klienten kan vise reaktiv confirm ved race-tilstand (23505).
export type SettGeneralsekretaerResultat =
  | { ok: true; forrigeProfilId: string | null; forrigeNavn: string | null }
  | { ok: false; kode: 'generalsekretaer_finnes'; innehaver: { id: string; navn: string } }
  | { ok: false; kode: 'feil'; melding: string }

export type FjernGeneralsekretaerResultat =
  | { ok: true; forrigeProfilId: string | null }
  // Race: forventet profil var ikke sittende GS lenger. Ingen demotering ble gjort.
  | { ok: false; kode: 'race_mismatch' }
  | { ok: false; kode: 'feil'; melding: string }

export async function oppdaterEgenProfil(data: { navn: string; visningsnavn: string; telefon: string; fodselsdato?: string; bilde_url?: string | null; stikkord?: string; matallergier?: string }) {
  const { supabase, user } = await ensureInnlogget()

  const navn = data.navn.trim()
  if (!navn) throw new Error('Navn kan ikke være tomt')
  const visningsnavn = (data.visningsnavn?.trim() || navn)

  const oppdatering: Record<string, unknown> = {
    navn,
    visningsnavn,
    telefon: normaliserTelefon(data.telefon),
    fodselsdato: data.fodselsdato || null,
    oppdatert: naa(),
  }
  if (data.bilde_url !== undefined) oppdatering.bilde_url = data.bilde_url
  // undefined betyr «feltet var ikke med i kallet», ikke «tøm det lagrede» —
  // samme defensive linje som matallergier rett under.
  if (data.stikkord !== undefined) oppdatering.stikkord = normaliserFritekst(data.stikkord, STIKKORD_MAKS_LENGDE)
  // Betinget av samme grunn som stikkord over: undefined betyr «feltet var
  // ikke med i kallet», ikke «tøm det som står lagret».
  if (data.matallergier !== undefined) {
    oppdatering.matallergier = normaliserFritekst(data.matallergier, MATALLERGIER_MAKS_LENGDE)
  }

  const { error } = await supabase
    .from('profiles')
    .update(oppdatering)
    .eq('id', user.id)

  if (error) throw new Error(error.message)
  revalidatePath('/profil')
  revalidatePath('/klubbinfo/medlemmer')
  // Egen-redigering revaliderer ikke detaljsiden fra før (oppdaterMedlemAdmin
  // under gjør det allerede) — stikkord er det første feltet derfra som
  // faktisk vises på /klubbinfo/medlemmer/[id].
  revalidatePath(`/klubbinfo/medlemmer/${user.id}`)
}

export async function oppdaterMedlemAdmin(id: string, data: { navn: string; visningsnavn: string; telefon: string; rolle: string; aktiv: boolean; fodselsdato?: string; faar_issue_varsler: boolean; faar_feilvarsler: boolean; stikkord: string; matallergier: string }) {
  const { supabase, klubbId } = await ensureAdmin()

  const navn = data.navn.trim()
  if (!navn) throw new Error('Navn kan ikke være tomt')
  const visningsnavn = (data.visningsnavn?.trim() || navn)

  // Allowlist på rolle: generalsekretær settes KUN via settGeneralsekretaer()
  // (RPC, atomisk). Hvis noen sender 'generalsekretaer' hit er det enten en
  // bug eller et forsøk på å omgå RPC-ens atomic demotér+promotér — begge deler
  // skal stoppes tidlig. Se migrasjon 094 for rationale. Samme allowlist står
  // i RPC-en (22023) — dette er den raske veien før nettverkskallet.
  if (data.rolle !== 'medlem' && data.rolle !== 'admin') {
    // UI-en demoterer en sittende GS via fjernGeneralsekretaer() FØR denne
    // actionen (handleLagre i RedigerMedlemSkjema) — vi kaster heller enn å
    // stille demotere.
    throw new Error('Ugyldig rolle. Generalsekretær settes og fjernes via egen flyt.')
  }

  // Rolle, aktiv og flaggene bor på medlemskap, profilfeltene på profiles —
  // RPC-en skriver begge i én transaksjon (migrasjon 163, #868). Invarianten
  // «en sittende GS får aldri rollen skrevet her» håndheves under `for update`
  // i RPC-en, ikke ved et løst forhåndsoppslag her (TOCTOU: en annen admin kan
  // demotere GS mellom oppslag og skriving).
  const { data: rolleSkrevet, error } = await supabase.rpc('oppdater_medlem_admin', {
    p_klubb_id: klubbId,
    p_profil_id: id,
    p_navn: navn,
    p_visningsnavn: visningsnavn,
    // as string: genererte RPC-typer kjenner ikke null i argumenter; funksjonen tar null (tomt felt).
    p_telefon: normaliserTelefon(data.telefon) as string,
    p_fodselsdato: (data.fodselsdato || null) as string,
    p_stikkord: normaliserFritekst(data.stikkord, STIKKORD_MAKS_LENGDE) as string,
    p_matallergier: normaliserFritekst(data.matallergier, MATALLERGIER_MAKS_LENGDE) as string,
    p_rolle: data.rolle,
    p_aktiv: data.aktiv,
    // To uavhengige varsel-brytere, begge admin-styrt per medlem:
    // faar_issue_varsler = nye innspill (migrasjon 104), faar_feilvarsler =
    // døgnalarmen om feil (migrasjon 123) — bevisst delt, se migrasjonen.
    p_faar_issue_varsler: data.faar_issue_varsler,
    p_faar_feilvarsler: data.faar_feilvarsler,
  })

  if (error) throw new Error(error.message)
  // false = medlemmet er sittende GS, og rollen ble ikke rørt. Warn (ikke
  // feil): typisk fordi GS-demotering håndteres av fjernGeneralsekretaer().
  if (rolleSkrevet === false) {
    logg.warn('profil.rolle.hoppet', { profil_id: id })
  }
  revalidatePath('/klubbinfo/medlemmer')
  revalidatePath(`/klubbinfo/medlemmer/${id}`)
}

// Setter en profilens rolle til 'generalsekretaer' via RPC (atomisk demotér+promotér).
// Returnerer strukturert resultat i stedet for å kaste, slik at klienten kan
// reagere på race-tilstand (23505 = unique violation) med reaktiv confirm.
export async function settGeneralsekretaer(nyProfilId: string): Promise<SettGeneralsekretaerResultat> {
  const { supabase } = await ensureAdmin()

  const { data, error } = await supabase
    .rpc('sett_generalsekretaer', { ny_profil: nyProfilId })

  if (error) {
    // 23505 = unique_violation: partial index medlemskap_unik_generalsekretaer
    // (speilet profiles_unik_generalsekretaer står til PR C) blokkerte INSERT/UPDATE fordi en annen GS ble satt i mellomtiden.
    if (error.code === '23505') {
      // Slå opp sittende GS for å vise reaktiv confirm i klienten. Fail-open
      // med logging: feiler oppslaget, faller vi bare gjennom til den
      // generiske { kode: 'feil' }-returen under — den bærer fortsatt
      // RPC-ens egen (korrekte) feilmelding, så ingenting blir misvisende.
      const { data: gs, error: gsFeil } = await supabase
        .from('profiles')
        .select('id, navn')
        .eq('rolle', 'generalsekretaer')
        .maybeSingle()
      if (gsFeil) logg.warn('profil.generalsekretaer.oppslag.feilet', { code: gsFeil.code })
      if (gs) {
        return { ok: false, kode: 'generalsekretaer_finnes', innehaver: { id: gs.id, navn: gs.navn } }
      }
    }
    return { ok: false, kode: 'feil', melding: error.message }
  }

  const rad = data?.[0]
  revalidatePath('/klubbinfo/medlemmer')
  revalidatePath(`/klubbinfo/medlemmer/${nyProfilId}`)
  if (rad?.forrige_profil) revalidatePath(`/klubbinfo/medlemmer/${rad.forrige_profil}`)

  return { ok: true, forrigeProfilId: rad?.forrige_profil ?? null, forrigeNavn: rad?.forrige_navn ?? null }
}

// Fjerner generalsekretær-tittelen fra sittende GS (demoterer til 'admin').
// Null GS er en gyldig tilstand — f.eks. i overgangsperiode.
//
// forventetProfilId: id-en klienten TRODDE var sittende GS da han åpnet siden.
// RPC-en demoterer kun hvis dette matcher faktisk sittende GS. Mismatch →
// `race_mismatch` returneres uten endring. Dette forhindrer at en annen admin
// som flyttet GS i mellomtiden får sin nye GS demotert ved en uskyldig lagring
// fra en utdatert side. Hvis forventetProfilId utelates faller vi tilbake til
// gammel oppførsel (demoter den som sitter — brukes bare hvis kalleren ikke
// har et entydig anker).
export async function fjernGeneralsekretaer(forventetProfilId?: string): Promise<FjernGeneralsekretaerResultat> {
  const { supabase } = await ensureAdmin()

  const { data, error } = await supabase
    .rpc('fjern_generalsekretaer', { forventet_profil: forventetProfilId ?? undefined })

  if (error) {
    return { ok: false, kode: 'feil', melding: error.message }
  }

  const rad = data?.[0]

  // Race-mismatch-deteksjon: hvis vi oppga forventetProfilId men RPC-en
  // returnerte tomrad (forrige_profil = null), betyr det enten at det ikke
  // var noen GS, eller at sittende GS ikke matchet forventningen vår.
  // Skill mellom de to ved å sjekke om vi i det hele tatt forventet en
  // demotering — kalleren her vet at det var en GS før, så null = mismatch.
  if (forventetProfilId && !rad?.forrige_profil) {
    return { ok: false, kode: 'race_mismatch' }
  }

  revalidatePath('/klubbinfo/medlemmer')
  if (rad?.forrige_profil) revalidatePath(`/klubbinfo/medlemmer/${rad.forrige_profil}`)

  return { ok: true, forrigeProfilId: rad?.forrige_profil ?? null }
}

export async function slettMedlem(id: string) {
  const { user } = await ensureAdmin()
  if (id === user.id) throw new Error('Kan ikke slette seg selv')

  const admin = createAdminClient()

  // Slett avhengige rader først, og kast FØR deleteUser ved feil — retry er
  // idempotent, og auth-brukeren skal aldri forsvinne før radene er borte (#760).
  const { error: paameldingerFeil } = await admin.from('paameldinger').delete().eq('profil_id', id)
  if (paameldingerFeil) throw new Error(`Kunne ikke slette påmeldinger for medlemmet: ${paameldingerFeil.message}`)

  const { error: pushFeil } = await admin.from('push_subscriptions').delete().eq('profil_id', id)
  if (pushFeil) throw new Error(`Kunne ikke slette push-abonnement for medlemmet: ${pushFeil.message}`)

  const { error: ansvarFeil } = await admin.from('arrangoransvar').update({ ansvarlig_id: null }).eq('ansvarlig_id', id)
  if (ansvarFeil) throw new Error(`Kunne ikke løsne arrangøransvar for medlemmet: ${ansvarFeil.message}`)

  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) throw new Error(error.message)

  revalidatePath('/klubbinfo/medlemmer')
  redirect('/klubbinfo/medlemmer')
}
