'use server'

import { ensureAdmin } from '@/lib/auth'
import { naa } from '@/lib/dato'
import { revalidatePath } from 'next/cache'

// Hjelpefunksjon — invalider fond-sidene etter alle mutasjoner
function revalider() {
  revalidatePath('/fond')
  revalidatePath('/fond/rediger')
}

// Skriv historikk-rad dersom verdien faktisk har endret seg.
// Kalles etter at ny verdi er skrevet til DB.
async function skrivHistorikk(
  supabase: Awaited<ReturnType<typeof import('@/lib/auth').ensureAdmin>>['supabase'],
  userId: string,
  kilde: 'eiendom' | 'verdipapir' | 'kontant',
  kilde_id: string | null,
  gammel_verdi: number,
  ny_verdi: number,
) {
  if (gammel_verdi === ny_verdi) return // ingen endring — ingenting å logge
  await supabase.from('fond_verdi_historikk').insert({
    kilde,
    kilde_id,
    gammel_verdi,
    ny_verdi,
    endret_av: userId,
    tidspunkt: naa(),
  })
}

// ─── Validering ──────────────────────────────────────────────────────────────

function validerBelop(verdi: number, feltnavn = 'Beløp') {
  // Maks to desimaler (øre) — DB-kolonnene er numeric(12,2). Toleransen på 1e-6
  // fanger flyttall-støy fra parseFloat (6612.20 kan bli 6612.199999...).
  const oere = verdi * 100
  if (!Number.isFinite(verdi) || verdi < 0 || Math.abs(oere - Math.round(oere)) > 1e-6)
    throw new Error(`${feltnavn} må være et ikke-negativt beløp med maks to desimaler`)
}

function validerNavn(navn: string, feltnavn = 'Navn') {
  if (!navn || navn.trim().length === 0) throw new Error(`${feltnavn} kan ikke være tomt`)
}

// ─── Eiendommer ──────────────────────────────────────────────────────────────

export async function opprettEiendom(input: {
  navn: string
  markedsverdi: number
  anskaffelsesverdi: number
}) {
  const { supabase } = await ensureAdmin()
  validerNavn(input.navn)
  validerBelop(input.markedsverdi, 'Markedsverdi')
  validerBelop(input.anskaffelsesverdi, 'Anskaffelsesverdi')

  const { error } = await supabase.from('fond_eiendom').insert({
    navn: input.navn.trim(),
    markedsverdi: input.markedsverdi,
    anskaffelsesverdi: input.anskaffelsesverdi,
    oppdatert: naa(),
  })
  if (error) throw new Error(error.message)
  revalider()
}

export async function oppdaterEiendom(input: {
  id: string
  navn: string
  markedsverdi: number
  anskaffelsesverdi: number
}) {
  const { supabase, user } = await ensureAdmin()
  validerNavn(input.navn)
  validerBelop(input.markedsverdi, 'Markedsverdi')
  validerBelop(input.anskaffelsesverdi, 'Anskaffelsesverdi')

  // Les gammel markedsverdi før oppdatering for historikk-logging
  const { data: gammel } = await supabase
    .from('fond_eiendom')
    .select('markedsverdi')
    .eq('id', input.id)
    .single()

  const { error } = await supabase
    .from('fond_eiendom')
    .update({
      navn: input.navn.trim(),
      markedsverdi: input.markedsverdi,
      anskaffelsesverdi: input.anskaffelsesverdi,
      oppdatert: naa(),
    })
    .eq('id', input.id)
  if (error) throw new Error(error.message)

  if (gammel) {
    await skrivHistorikk(supabase, user.id, 'eiendom', input.id, gammel.markedsverdi, input.markedsverdi)
  }
  revalider()
}

export async function slettEiendom(id: string) {
  const { supabase, user } = await ensureAdmin()

  // Logg historikk før sletting: uten en 0-rad får den fremtidige utviklingsgrafen
  // et usynlig hopp der eiendommens verdi bare forsvinner. Les siste verdi, så slett —
  // kilde_id har ingen FK til kildetabellen, så rekkefølgen er ikke constraint-tvunget.
  const { data: gammel } = await supabase
    .from('fond_eiendom')
    .select('markedsverdi')
    .eq('id', id)
    .single()
  if (gammel) {
    await skrivHistorikk(supabase, user.id, 'eiendom', id, gammel.markedsverdi, 0)
  }

  const { error } = await supabase.from('fond_eiendom').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalider()
}

// ─── Verdipapirer ────────────────────────────────────────────────────────────

export async function opprettVerdipapir(input: {
  navn: string
  type: 'aksje' | 'fond'
  verdi: number
  anskaffelsesverdi: number
}) {
  const { supabase } = await ensureAdmin()
  validerNavn(input.navn)
  validerBelop(input.verdi, 'Verdi')
  validerBelop(input.anskaffelsesverdi, 'Anskaffelsesverdi')

  const { error } = await supabase.from('fond_verdipapir').insert({
    navn: input.navn.trim(),
    type: input.type,
    verdi: input.verdi,
    anskaffelsesverdi: input.anskaffelsesverdi,
    oppdatert: naa(),
  })
  if (error) throw new Error(error.message)
  revalider()
}

export async function oppdaterVerdipapir(input: {
  id: string
  navn: string
  type: 'aksje' | 'fond'
  verdi: number
  anskaffelsesverdi: number
}) {
  const { supabase, user } = await ensureAdmin()
  validerNavn(input.navn)
  validerBelop(input.verdi, 'Verdi')
  validerBelop(input.anskaffelsesverdi, 'Anskaffelsesverdi')

  const { data: gammel } = await supabase
    .from('fond_verdipapir')
    .select('verdi')
    .eq('id', input.id)
    .single()

  const { error } = await supabase
    .from('fond_verdipapir')
    .update({
      navn: input.navn.trim(),
      type: input.type,
      verdi: input.verdi,
      anskaffelsesverdi: input.anskaffelsesverdi,
      oppdatert: naa(),
    })
    .eq('id', input.id)
  if (error) throw new Error(error.message)

  if (gammel) {
    await skrivHistorikk(supabase, user.id, 'verdipapir', input.id, gammel.verdi, input.verdi)
  }
  revalider()
}

export async function slettVerdipapir(id: string) {
  const { supabase, user } = await ensureAdmin()

  // Logg historikk før sletting — se kommentar i slettEiendom for hvorfor (graf-kontinuitet).
  const { data: gammel } = await supabase
    .from('fond_verdipapir')
    .select('verdi')
    .eq('id', id)
    .single()
  if (gammel) {
    await skrivHistorikk(supabase, user.id, 'verdipapir', id, gammel.verdi, 0)
  }

  const { error } = await supabase.from('fond_verdipapir').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalider()
}

// ─── Innskudd ────────────────────────────────────────────────────────────────

export async function opprettInnskudd(input: {
  profil_id: string
  belop: number
  dato: string // ISO-dato: YYYY-MM-DD
}) {
  const { supabase } = await ensureAdmin()
  if (!input.profil_id) throw new Error('Innskyter må velges')
  validerBelop(input.belop, 'Beløp')
  if (!input.dato) throw new Error('Dato kan ikke være tom')

  const { error } = await supabase.from('fond_innskudd').insert({
    profil_id: input.profil_id,
    belop: input.belop,
    dato: input.dato,
  })
  if (error) throw new Error(error.message)
  revalider()
}

export async function oppdaterInnskudd(input: {
  id: string
  profil_id: string
  belop: number
  dato: string
}) {
  const { supabase } = await ensureAdmin()
  if (!input.profil_id) throw new Error('Innskyter må velges')
  validerBelop(input.belop, 'Beløp')
  if (!input.dato) throw new Error('Dato kan ikke være tom')

  const { error } = await supabase
    .from('fond_innskudd')
    .update({ profil_id: input.profil_id, belop: input.belop, dato: input.dato })
    .eq('id', input.id)
  if (error) throw new Error(error.message)
  revalider()
}

export async function slettInnskudd(id: string) {
  const { supabase } = await ensureAdmin()
  const { error } = await supabase.from('fond_innskudd').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalider()
}

// ─── Kontant-singleton ───────────────────────────────────────────────────────

export async function oppdaterKontantSaldo(nySaldo: number) {
  const { supabase, user } = await ensureAdmin()
  validerBelop(nySaldo, 'Saldo')

  // Les gammel saldo; kan mangle hvis singleton ikke er seeded enda
  const { data: gammel } = await supabase
    .from('fond_kontant')
    .select('saldo')
    .eq('id', 1)
    .single()

  // UPSERT: insert hvis rad ikke finnes, update ellers
  const { error } = await supabase
    .from('fond_kontant')
    .upsert({ id: 1, saldo: nySaldo, oppdatert: naa() }, { onConflict: 'id' })
  if (error) throw new Error(error.message)

  await skrivHistorikk(supabase, user.id, 'kontant', null, gammel?.saldo ?? 0, nySaldo)
  revalider()
}
