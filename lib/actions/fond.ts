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

// ─── Hent og skriv publisert oppgjør ─────────────────────────────────────────

// DTO fra hentPublisertOppgjor — rent data, ingen side-effekter.
// Brukes av HentOppgjor-komponenten for å vise diff.
export type OppgjorDiff = {
  snapshot_dato: string
  generert: string
  saldo: { app: number; hentet: number }
  rader: {
    profil_id: string
    visningsnavn: string
    appVerdi: number | null   // null = ingen rad i fond_innskudd enda
    hentetVerdi: number
    antallRader: number       // > 1 = blokkerende tilstand
  }[]
}

// Finner nøyaktig én aktiv profil for et visningsnavn (trimmet).
// profiles.visningsnavn har ingen unik constraint i DB, så to aktive profiler kan
// dele kallenavn. Da er matchingen tvetydig og vi kaster i stedet for å velge
// stille førstetreff — feil profil ville fått innskuddet skrevet (#453).
function matchProfil(
  profilListe: { id: string; visningsnavn: string | null }[],
  visningsnavn: string,
): { id: string; visningsnavn: string | null } {
  const trimmet = visningsnavn.trim()
  const treff = profilListe.filter((p) => p.visningsnavn?.trim() === trimmet)
  if (treff.length === 0)
    throw new Error(
      `Ukjent visningsnavn i oppgjøret: «${visningsnavn}» — ingen aktiv profil matcher`,
    )
  if (treff.length > 1)
    throw new Error(
      `Flere medlemmer heter «${trimmet}» — rydd i visningsnavn før oppgjøret kan hentes`,
    )
  return treff[0]
}

export async function hentPublisertOppgjor(): Promise<
  { ok: true; diff: OppgjorDiff } | { ok: false; feil: string }
> {
  // ensureAdmin() kastes UTENFOR try/catch — uautoriserte kall skal propagere som
  // vanlig feil (401/403), ikke pakkes inn som { ok: false } (Policy: Auth).
  const { supabase } = await ensureAdmin()

  // Next.js maskerer feilmeldinger kastet fra server actions i prod (se #459),
  // så resten av funksjonen returnerer { ok: false, feil: ... } i stedet for å kaste.
  try {
    const { FOND_OPPGJOR_URL } = await import('@/lib/config')
    if (!FOND_OPPGJOR_URL)
      throw new Error('Henting av oppgjør er ikke konfigurert')

    const { hentOppgjor } = await import('@/lib/fond-oppgjor')
    const oppgjor = await hentOppgjor()

    // Hent alle aktive profiler for å matche visningsnavn → profil_id
    const { data: profiler } = await supabase
      .from('profiles')
      .select('id, visningsnavn')
      .eq('aktiv', true)

    const profilListe = profiler ?? []

    // Bygg opp én rad per andel; ukjent navn → kast umiddelbart
    const raderUtenAppVerdi: {
      profil_id: string
      visningsnavn: string
      hentetVerdi: number
    }[] = []

    for (const andel of oppgjor.andeler) {
      const match = matchProfil(profilListe, andel.visningsnavn)
      raderUtenAppVerdi.push({
        profil_id: match.id,
        visningsnavn: andel.visningsnavn,
        hentetVerdi: andel.belop,
      })
    }

    // Hent alle innskudd-rader og kontant-saldo fra appen
    const { data: innskuddRader } = await supabase
      .from('fond_innskudd')
      .select('id, profil_id, belop')

    const { data: kontant } = await supabase
      .from('fond_kontant')
      .select('saldo')
      .eq('id', 1)
      .maybeSingle()

    const alleInnskudd = innskuddRader ?? []

    // Bygg diff-rader: slå opp app-verdi og tell rader per profil
    const rader: OppgjorDiff['rader'] = raderUtenAppVerdi.map((r) => {
      const egneRader = alleInnskudd.filter((i) => i.profil_id === r.profil_id)
      const antallRader = egneRader.length
      // Kun entydig ved nøyaktig én rad — 0 (ingen rad enda) og >1 (blokkerende
      // duplikat) gir begge null appVerdi. Number() fordi PostgREST kan serialisere
      // numeric som string.
      const appVerdi = antallRader === 1 ? Number(egneRader[0].belop) : null
      return {
        profil_id: r.profil_id,
        visningsnavn: r.visningsnavn,
        appVerdi,
        hentetVerdi: r.hentetVerdi,
        antallRader,
      }
    })

    return {
      ok: true,
      diff: {
        snapshot_dato: oppgjor.snapshot_dato,
        generert: oppgjor.generert,
        saldo: {
          app: Number(kontant?.saldo ?? 0),
          hentet: oppgjor.saldo,
        },
        rader,
      },
    }
  } catch (e) {
    return { ok: false, feil: e instanceof Error ? e.message : 'Ukjent feil ved henting av oppgjør' }
  }
}

export async function skrivPublisertOppgjor(oppgjorPayload: unknown): Promise<
  { ok: true } | { ok: false; feil: string }
> {
  // ensureAdmin() kastes UTENFOR try/catch — uautoriserte kall skal propagere som
  // vanlig feil (401/403), ikke pakkes inn som { ok: false } (Policy: Auth).
  const { supabase, user } = await ensureAdmin()

  // Next.js maskerer feilmeldinger kastet fra server actions i prod (se #459),
  // så resten av funksjonen returnerer { ok: false, feil: ... } i stedet for å kaste.
  try {
    const { FOND_OPPGJOR_URL } = await import('@/lib/config')
    if (!FOND_OPPGJOR_URL)
      throw new Error('Henting av oppgjør er ikke konfigurert')

    // Re-valider ALT server-side — stol aldri blindt på klient-payload.
    // Bevisst ingen re-henting fra kilden her (TOCTOU-herding utenfor scope, #453):
    // payload re-valideres fullt, kun admin, «det du så er det som skrives».
    const { validerOppgjor } = await import('@/lib/fond-oppgjor')
    const oppgjor = validerOppgjor(oppgjorPayload)

    const { data: profiler } = await supabase
      .from('profiles')
      .select('id, visningsnavn')
      .eq('aktiv', true)

    const profilListe = profiler ?? []

    // Match alle andeler til profiler — kast hvis ukjent eller tvetydig navn
    const matchede: { profil_id: string; visningsnavn: string; belop: number }[] = []
    for (const andel of oppgjor.andeler) {
      const match = matchProfil(profilListe, andel.visningsnavn)
      matchede.push({ profil_id: match.id, visningsnavn: andel.visningsnavn, belop: andel.belop })
    }

    // Sjekk at ingen profil har flere innskudd-rader — kast FØR første skriving
    const { data: alleInnskudd } = await supabase
      .from('fond_innskudd')
      .select('id, profil_id')

    const alleRader = alleInnskudd ?? []
    for (const m of matchede) {
      const antall = alleRader.filter((i) => i.profil_id === m.profil_id).length
      if (antall > 1)
        throw new Error(
          `${m.visningsnavn} har ${antall} innskudd-rader — rydd manuelt i editoren først`,
        )
    }

    // Skriv andeler — upsert per profil (update hvis rad finnes, insert ellers).
    // snapshot_dato overstyrer alltid dato — det er snapshot-semantikken (#453).
    for (const m of matchede) {
      const eksisterende = alleRader.find((i) => i.profil_id === m.profil_id)
      if (eksisterende) {
        const { error } = await supabase
          .from('fond_innskudd')
          .update({ belop: m.belop, dato: oppgjor.snapshot_dato })
          .eq('id', eksisterende.id)
        if (error)
          throw new Error(
            `Feil ved oppdatering av ${m.visningsnavn}: ${error.message}. Operasjonen er idempotent — hent og skriv på nytt.`,
          )
      } else {
        const { error } = await supabase
          .from('fond_innskudd')
          .insert({ profil_id: m.profil_id, belop: m.belop, dato: oppgjor.snapshot_dato })
        if (error)
          throw new Error(
            `Feil ved opprettelse av rad for ${m.visningsnavn}: ${error.message}. Operasjonen er idempotent — hent og skriv på nytt.`,
          )
      }
    }

    // Skriv saldo via skrivHistorikk-logikken fra oppdaterKontantSaldo (historikk-logging inkludert)
    const { data: gammelKontant } = await supabase
      .from('fond_kontant')
      .select('saldo')
      .eq('id', 1)
      .single()

    const { error: kontantFeil } = await supabase
      .from('fond_kontant')
      .upsert({ id: 1, saldo: oppgjor.saldo, oppdatert: naa() }, { onConflict: 'id' })
    if (kontantFeil)
      throw new Error(
        `Feil ved oppdatering av saldo: ${kontantFeil.message}. Operasjonen er idempotent — hent og skriv på nytt.`,
      )

    await skrivHistorikk(supabase, user.id, 'kontant', null, Number(gammelKontant?.saldo ?? 0), oppgjor.saldo)

    // Cache-revalidering skjer i egen indre try/catch: DB-skrivingen (innskudd +
    // saldo + historikk) er allerede fullført her, så suksess skal reflektere
    // DB-tilstand, ikke cache-tilstand. En revalidatePath som kaster må aldri
    // velte et vellykket oppgjør til { ok: false } (se #459).
    try {
      revalidatePath('/fond')
      revalidatePath('/fond/rediger')
      revalidatePath('/profil')
      revalidatePath('/', 'layout')
    } catch {
      // Bevisst svelget — revalidering er best-effort etter en fullført skriving.
    }

    return { ok: true }
  } catch (e) {
    return { ok: false, feil: e instanceof Error ? e.message : 'Ukjent feil ved skriving av oppgjør' }
  }
}

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
