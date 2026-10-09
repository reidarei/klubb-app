'use server'

import { ensureAdmin } from '@/lib/auth'
import { naa } from '@/lib/dato'
import { revalidatePath } from 'next/cache'
import { logg } from '@/lib/logg'

function revalider() {
  revalidatePath('/fond')
  revalidatePath('/fond/rediger')
}

// Kalles etter at ny verdi er skrevet.
async function skrivHistorikk(
  supabase: Awaited<ReturnType<typeof import('@/lib/auth').ensureAdmin>>['supabase'],
  userId: string,
  kilde: 'eiendom' | 'verdipapir' | 'kontant',
  kilde_id: string | null,
  gammel_verdi: number,
  ny_verdi: number,
) {
  if (gammel_verdi === ny_verdi) return
  const { error } = await supabase.from('fond_verdi_historikk').insert({
    kilde,
    kilde_id,
    gammel_verdi,
    ny_verdi,
    endret_av: userId,
    tidspunkt: naa(),
  })
  // Verdien er alt lagret — en feilet historikk-rad logges, velter ikke (#760).
  if (error) {
    await logg.feil('fond.historikk.feilet', error, { ctx: { code: error.code, sample: kilde } })
  }
}

// ─── Validering ──────────────────────────────────────────────────────────────

function validerBelop(verdi: number, feltnavn = 'Beløp') {
  // numeric(12,2). 1e-6 tåler flyttall-støy (6612.20 → 6612.199999...).
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
  husleie_i_aar: number
  driftskostnader_i_aar: number
}) {
  const { supabase } = await ensureAdmin()
  validerNavn(input.navn)
  validerBelop(input.markedsverdi, 'Markedsverdi')
  validerBelop(input.anskaffelsesverdi, 'Anskaffelsesverdi')
  validerBelop(input.husleie_i_aar, 'Husleie i år')
  // Lagres POSITIVT, trekkes fra i visningen (check-constraint, mig. 129).
  validerBelop(input.driftskostnader_i_aar, 'Driftskostnader i år')

  const { error } = await supabase.from('fond_eiendom').insert({
    navn: input.navn.trim(),
    markedsverdi: input.markedsverdi,
    anskaffelsesverdi: input.anskaffelsesverdi,
    husleie_i_aar: input.husleie_i_aar,
    driftskostnader_i_aar: input.driftskostnader_i_aar,
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
  husleie_i_aar: number
  driftskostnader_i_aar: number
}) {
  const { supabase, user } = await ensureAdmin()
  validerNavn(input.navn)
  validerBelop(input.markedsverdi, 'Markedsverdi')
  validerBelop(input.anskaffelsesverdi, 'Anskaffelsesverdi')
  validerBelop(input.husleie_i_aar, 'Husleie i år')
  // Lagres POSITIVT, trekkes fra i visningen (check-constraint, mig. 129).
  validerBelop(input.driftskostnader_i_aar, 'Driftskostnader i år')

  // Kaster FØR oppdateringen hvis gammel verdi ikke kan leses — ellers er
  // sporet av en pengeendring borte for godt. maybeSingle så «raden er borte»
  // får egen melding i stedet for PGRST116.
  const { data: gammel, error: gammelFeil } = await supabase
    .from('fond_eiendom')
    .select('markedsverdi')
    .eq('id', input.id)
    .maybeSingle()
  if (gammelFeil) {
    await logg.feil('fond.eiendom.oppslag.feilet', gammelFeil, { ctx: { code: gammelFeil.code } })
    throw new Error(`Kunne ikke lese gjeldende markedsverdi for historikk: ${gammelFeil.message}`)
  }
  // Slettet mens skjemaet sto åpent: update-en ville vært en stille no-op.
  if (!gammel) throw new Error('Eiendommen finnes ikke lenger — den er slettet av noen andre')

  const { error } = await supabase
    .from('fond_eiendom')
    .update({
      navn: input.navn.trim(),
      markedsverdi: input.markedsverdi,
      anskaffelsesverdi: input.anskaffelsesverdi,
      husleie_i_aar: input.husleie_i_aar,
      driftskostnader_i_aar: input.driftskostnader_i_aar,
      oppdatert: naa(),
    })
    .eq('id', input.id)
  if (error) throw new Error(error.message)

  await skrivHistorikk(supabase, user.id, 'eiendom', input.id, gammel.markedsverdi, input.markedsverdi)
  revalider()
}

export async function slettEiendom(id: string) {
  const { supabase, user } = await ensureAdmin()

  // 0-rad i historikken før sletting, ellers forsvinner verdien usynlig fra
  // utviklingsgrafen (kilde_id har ingen FK, så rekkefølgen er ikke tvunget).
  // Kaster hvis oppslaget feiler, men er IDEMPOTENT når raden alt er borte
  // (to admins/faner) — da er utfallet brukeren ba om allerede sant.
  const { data: gammel, error: gammelFeil } = await supabase
    .from('fond_eiendom')
    .select('markedsverdi')
    .eq('id', id)
    .maybeSingle()
  if (gammelFeil) {
    await logg.feil('fond.eiendom.oppslag.feilet', gammelFeil, { ctx: { code: gammelFeil.code } })
    throw new Error(`Kunne ikke lese gjeldende markedsverdi for historikk: ${gammelFeil.message}`)
  }
  // Ingen rad: 0-raden ble skrevet av den som slettet først.
  if (gammel) await skrivHistorikk(supabase, user.id, 'eiendom', id, gammel.markedsverdi, 0)

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
  utbytte_i_aar: number
}) {
  const { supabase } = await ensureAdmin()
  validerNavn(input.navn)
  validerBelop(input.verdi, 'Verdi')
  validerBelop(input.anskaffelsesverdi, 'Anskaffelsesverdi')
  validerBelop(input.utbytte_i_aar, 'Utbytte i år')

  const { error } = await supabase.from('fond_verdipapir').insert({
    navn: input.navn.trim(),
    type: input.type,
    verdi: input.verdi,
    anskaffelsesverdi: input.anskaffelsesverdi,
    utbytte_i_aar: input.utbytte_i_aar,
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
  utbytte_i_aar: number
}) {
  const { supabase, user } = await ensureAdmin()
  validerNavn(input.navn)
  validerBelop(input.verdi, 'Verdi')
  validerBelop(input.anskaffelsesverdi, 'Anskaffelsesverdi')
  validerBelop(input.utbytte_i_aar, 'Utbytte i år')

  // Samme resonnement som oppdaterEiendom.
  const { data: gammel, error: gammelFeil } = await supabase
    .from('fond_verdipapir')
    .select('verdi')
    .eq('id', input.id)
    .maybeSingle()
  if (gammelFeil) {
    await logg.feil('fond.verdipapir.oppslag.feilet', gammelFeil, { ctx: { code: gammelFeil.code } })
    throw new Error(`Kunne ikke lese gjeldende verdi for historikk: ${gammelFeil.message}`)
  }
  if (!gammel) throw new Error('Verdipapiret finnes ikke lenger — det er slettet av noen andre')

  const { error } = await supabase
    .from('fond_verdipapir')
    .update({
      navn: input.navn.trim(),
      type: input.type,
      verdi: input.verdi,
      anskaffelsesverdi: input.anskaffelsesverdi,
      utbytte_i_aar: input.utbytte_i_aar,
      oppdatert: naa(),
    })
    .eq('id', input.id)
  if (error) throw new Error(error.message)

  await skrivHistorikk(supabase, user.id, 'verdipapir', input.id, gammel.verdi, input.verdi)
  revalider()
}

export async function slettVerdipapir(id: string) {
  const { supabase, user } = await ensureAdmin()

  // Samme resonnement som slettEiendom.
  const { data: gammel, error: gammelFeil } = await supabase
    .from('fond_verdipapir')
    .select('verdi')
    .eq('id', id)
    .maybeSingle()
  if (gammelFeil) {
    await logg.feil('fond.verdipapir.oppslag.feilet', gammelFeil, { ctx: { code: gammelFeil.code } })
    throw new Error(`Kunne ikke lese gjeldende verdi for historikk: ${gammelFeil.message}`)
  }
  if (gammel) await skrivHistorikk(supabase, user.id, 'verdipapir', id, gammel.verdi, 0)

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

// ─── Hent og skriv publisert oppgjør ─────────────────────────────────────────

// DTO fra hentPublisertOppgjor, vises som diff i HentOppgjor.
export type OppgjorDiff = {
  snapshot_dato: string
  generert: string
  saldo: { app: number; hentet: number }
  // Ukjente eller tvetydige navn. Blokkerer skriving til admin har koblet
  // dem (#571).
  uavklarteNavn: string[]
  rader: {
    profil_id: string
    visningsnavn: string
    appVerdi: number | null   // null = ingen rad i fond_innskudd enda
    hentetVerdi: number
    antallRader: number       // > 1 = blokkerende tilstand
    // null = eldre API-svar uten detaljer.
    // VIKTIG: HentOppgjor.tsx bygger skrive-payloaden FRA DENNE DTO-en. Nytt
    // felt i oppgjørs-kontrakten må inn her, ellers forsvinner det stille
    // mellom «Hent» og «Skriv». Pinnet i __tests__/fond-oppgjor-dto.test.ts.
    detaljer: {
      oppspart_akkumulert: number
      renteandel_i_fjor: number
      bevegelser: { dato: string; belop: number }[]
    } | null
  }[]
}

// Alias (fond_navn_alias) FØRST, så en manuell kobling vinner over et
// tilfeldig navnesammenfall og historiske navn fortsatt matcher; deretter
// eksakt visningsnavn.
//
// null ved ukjent eller tvetydig navn i stedet for å kaste, så kalleren kan
// samle ALLE uavklarte (#571). Tvetydig = uavklart: feil valg sender andelen
// til feil person (#453).
function matchProfil(
  profilListe: { id: string; visningsnavn: string | null }[],
  alias: Map<string, string>,
  visningsnavn: string,
): { id: string; visningsnavn: string | null } | null {
  const trimmet = visningsnavn.trim()

  const aliasProfilId = alias.get(trimmet)
  if (aliasProfilId) {
    const viaAlias = profilListe.find((p) => p.id === aliasProfilId)
    // Alias til en siden deaktivert profil er ugyldig — ny vurdering.
    if (viaAlias) return viaAlias
  }

  const treff = profilListe.filter((p) => p.visningsnavn?.trim() === trimmet)
  return treff.length === 1 ? treff[0] : null
}

export async function hentPublisertOppgjor(): Promise<
  { ok: true; diff: OppgjorDiff } | { ok: false; feil: string }
> {
  // UTENFOR try/catch: avvist tilgang skal kaste, ikke bli { ok: false }.
  const { supabase } = await ensureAdmin()

  // Next maskerer kastede meldinger i prod (#459) — returner { ok: false }.
  try {
    const { FOND_OPPGJOR_URL } = await import('@/lib/config')
    if (!FOND_OPPGJOR_URL)
      throw new Error('Henting av oppgjør er ikke konfigurert')

    const { hentOppgjor } = await import('@/lib/fond-oppgjor')
    const oppgjor = await hentOppgjor()

    // Kaster i stedet for profilListe=[], som ville gjort én DB-feil til
    // «ukjent navn» for hver andel.
    const { data: profiler, error: profilerFeil } = await supabase
      .from('profiles')
      .select('id, visningsnavn')
      .eq('aktiv', true)
    if (profilerFeil) {
      await logg.feil('fond.oppgjor.profiler.feilet', profilerFeil)
      throw new Error(`Kunne ikke hente profiler for oppgjøret: ${profilerFeil.message}`)
    }

    const profilListe = profiler ?? []

    // Fail-closed: uten aliasene ser kjente navn ukjente ut.
    const { data: aliasRader, error: aliasFeil } = await supabase
      .from('fond_navn_alias')
      .select('api_navn, profil_id')
    if (aliasFeil) {
      await logg.feil('fond.oppgjor.alias.feilet', aliasFeil)
      throw new Error(`Kunne ikke hente navnekoblinger: ${aliasFeil.message}`)
    }
    const aliasMap = new Map((aliasRader ?? []).map((a) => [a.api_navn, a.profil_id]))

    const raderUtenAppVerdi: {
      profil_id: string
      visningsnavn: string
      hentetVerdi: number
      detaljer: OppgjorDiff['rader'][number]['detaljer']
    }[] = []

    const { harDetaljer } = await import('@/lib/fond-oppgjor')

    const uavklarteNavn: string[] = []

    for (const andel of oppgjor.andeler) {
      const match = matchProfil(profilListe, aliasMap, andel.visningsnavn)
      if (!match) {
        uavklarteNavn.push(andel.visningsnavn)
        continue
      }
      raderUtenAppVerdi.push({
        profil_id: match.id,
        visningsnavn: andel.visningsnavn,
        hentetVerdi: andel.belop,
        // validerOppgjor håndhever hele-pakken-eller-ingenting.
        detaljer: harDetaljer(andel)
          ? {
              oppspart_akkumulert: andel.oppspart_akkumulert,
              renteandel_i_fjor: andel.renteandel_i_fjor,
              bevegelser: andel.bevegelser,
            }
          : null,
      })
    }

    // Fail-closed: en svelget feil ville vist «ingen rad enda» for ALLE i
    // diffen admin bruker til å avgjøre skrivingen.
    const { data: innskuddRader, error: innskuddFeil } = await supabase
      .from('fond_innskudd')
      .select('id, profil_id, belop')
    if (innskuddFeil) {
      await logg.feil('fond.oppgjor.innskudd.feilet', innskuddFeil)
      throw new Error(`Kunne ikke hente innskudd for oppgjøret: ${innskuddFeil.message}`)
    }

    const { data: kontant, error: kontantFeil } = await supabase
      .from('fond_kontant')
      .select('saldo')
      .eq('id', 1)
      .maybeSingle()
    if (kontantFeil) {
      await logg.feil('fond.oppgjor.saldo.feilet', kontantFeil)
      throw new Error(`Kunne ikke hente kontantsaldo for oppgjøret: ${kontantFeil.message}`)
    }

    const alleInnskudd = innskuddRader ?? []

    const rader: OppgjorDiff['rader'] = raderUtenAppVerdi.map((r) => {
      const egneRader = alleInnskudd.filter((i) => i.profil_id === r.profil_id)
      const antallRader = egneRader.length
      // Kun entydig ved nøyaktig én rad. Number(): PostgREST kan gi numeric
      // som string.
      const appVerdi = antallRader === 1 ? Number(egneRader[0].belop) : null
      return {
        profil_id: r.profil_id,
        visningsnavn: r.visningsnavn,
        appVerdi,
        hentetVerdi: r.hentetVerdi,
        antallRader,
        detaljer: r.detaljer,
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
        uavklarteNavn,
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
  // UTENFOR try/catch: avvist tilgang skal kaste, ikke bli { ok: false }.
  const { supabase, user } = await ensureAdmin()

  // Next maskerer kastede meldinger i prod (#459) — returner { ok: false }.
  try {
    const { FOND_OPPGJOR_URL } = await import('@/lib/config')
    if (!FOND_OPPGJOR_URL)
      throw new Error('Henting av oppgjør er ikke konfigurert')

    // Re-valider ALT server-side. Bevisst ingen re-henting fra kilden: «det
    // du så er det som skrives» (TOCTOU-herding utenfor scope, #453).
    const { validerOppgjor } = await import('@/lib/fond-oppgjor')
    const oppgjor = validerOppgjor(oppgjorPayload)

    // Fail-closed, som i hentPublisertOppgjor.
    const { data: profiler, error: profilerFeil } = await supabase
      .from('profiles')
      .select('id, visningsnavn')
      .eq('aktiv', true)
    if (profilerFeil) {
      await logg.feil('fond.oppgjor.profiler.feilet', profilerFeil)
      throw new Error(`Kunne ikke hente profiler for oppgjøret: ${profilerFeil.message}`)
    }

    const profilListe = profiler ?? []

    // Samme aliaser som ved henting, ellers ignoreres en fersk kobling.
    const { data: aliasRader, error: aliasFeil } = await supabase
      .from('fond_navn_alias')
      .select('api_navn, profil_id')
    if (aliasFeil) {
      await logg.feil('fond.oppgjor.alias.feilet', aliasFeil)
      throw new Error(`Kunne ikke hente navnekoblinger: ${aliasFeil.message}`)
    }
    const aliasMap = new Map((aliasRader ?? []).map((a) => [a.api_navn, a.profil_id]))

    const { harDetaljer } = await import('@/lib/fond-oppgjor')
    const matchede: {
      profil_id: string
      visningsnavn: string
      belop: number
      detaljer: {
        oppspart_akkumulert: number
        renteandel_i_fjor: number
        bevegelser: { dato: string; belop: number }[]
      } | null
    }[] = []
    for (const andel of oppgjor.andeler) {
      const match = matchProfil(profilListe, aliasMap, andel.visningsnavn)
      // Ved skriving kaster vi: noe har endret seg siden henting (profil
      // deaktivert, alias slettet), og admin må se på det på nytt.
      if (!match)
        throw new Error(
          `Ukjent navn i oppgjøret: «${andel.visningsnavn}» — koble det til et medlem før du skriver`,
        )
      matchede.push({
        profil_id: match.id,
        visningsnavn: andel.visningsnavn,
        belop: andel.belop,
        detaljer: harDetaljer(andel)
          ? {
              oppspart_akkumulert: andel.oppspart_akkumulert,
              renteandel_i_fjor: andel.renteandel_i_fjor,
              bevegelser: andel.bevegelser,
            }
          : null,
      })
    }

    // Duplikat-sjekk FØR første skriving. Fail-closed: alleRader=[] ville
    // latt sjekken passere stille.
    const { data: alleInnskudd, error: alleInnskuddFeil } = await supabase
      .from('fond_innskudd')
      .select('id, profil_id')
    if (alleInnskuddFeil) {
      await logg.feil('fond.oppgjor.innskudd.feilet', alleInnskuddFeil)
      throw new Error(`Kunne ikke hente innskudd for oppgjøret: ${alleInnskuddFeil.message}`)
    }

    const alleRader = alleInnskudd ?? []
    for (const m of matchede) {
      const antall = alleRader.filter((i) => i.profil_id === m.profil_id).length
      if (antall > 1)
        throw new Error(
          `${m.visningsnavn} har ${antall} innskudd-rader — rydd manuelt i editoren først`,
        )
    }

    // snapshot_dato overstyrer alltid dato — snapshot-semantikk (#453).
    for (const m of matchede) {
      // Uten detaljpakke nullstilles fjorårstallene bevisst — en gammel
      // oppdeling ville ellers ikke lenger summere seg til den nye totalen.
      const fjor = {
        oppspart_akkumulert: m.detaljer?.oppspart_akkumulert ?? 0,
        renteandel_i_fjor: m.detaljer?.renteandel_i_fjor ?? 0,
      }
      const eksisterende = alleRader.find((i) => i.profil_id === m.profil_id)
      if (eksisterende) {
        const { error } = await supabase
          .from('fond_innskudd')
          .update({ belop: m.belop, dato: oppgjor.snapshot_dato, ...fjor })
          .eq('id', eksisterende.id)
        if (error)
          throw new Error(
            `Feil ved oppdatering av ${m.visningsnavn}: ${error.message}. Operasjonen er idempotent — hent og skriv på nytt.`,
          )
      } else {
        const { error } = await supabase
          .from('fond_innskudd')
          .insert({ profil_id: m.profil_id, belop: m.belop, dato: oppgjor.snapshot_dato, ...fjor })
        if (error)
          throw new Error(
            `Feil ved opprettelse av rad for ${m.visningsnavn}: ${error.message}. Operasjonen er idempotent — hent og skriv på nytt.`,
          )
      }
    }

    // Atomisk slett-så-sett-inn per person (mig. 126). Kun med detaljer — et
    // eldre API-svar skal ikke tørke ut eksisterende bevegelser.
    const medDetaljer = matchede.filter((m) => m.detaljer !== null)
    if (medDetaljer.length > 0) {
      const { error: bevegelseFeil } = await supabase.rpc('skriv_fond_bevegelser', {
        p_aar: Number(oppgjor.snapshot_dato.slice(0, 4)),
        p_data: medDetaljer.map((m) => ({
          profil_id: m.profil_id,
          bevegelser: m.detaljer!.bevegelser,
        })),
      })
      if (bevegelseFeil) {
        await logg.feil('fond.oppgjor.bevegelser.feilet', bevegelseFeil)
        throw new Error(
          `Feil ved skriving av bevegelser: ${bevegelseFeil.message}. Totalene er skrevet — hent og skriv på nytt for å fullføre.`,
        )
      }
    }

    // maybeSingle: singletonen kan mangle før seeding. En ekte feil kaster —
    // ellers logger historikken «endret fra 0» med ukjent gammel saldo.
    const { data: gammelKontant, error: gammelKontantFeil } = await supabase
      .from('fond_kontant')
      .select('saldo')
      .eq('id', 1)
      .maybeSingle()
    if (gammelKontantFeil) {
      await logg.feil('fond.kontant.oppslag.feilet', gammelKontantFeil)
      throw new Error(`Kunne ikke lese gjeldende saldo for historikk: ${gammelKontantFeil.message}`)
    }

    const { error: kontantFeil } = await supabase
      .from('fond_kontant')
      .upsert({ id: 1, saldo: oppgjor.saldo, oppdatert: naa() }, { onConflict: 'id' })
    if (kontantFeil)
      throw new Error(
        `Feil ved oppdatering av saldo: ${kontantFeil.message}. Operasjonen er idempotent — hent og skriv på nytt.`,
      )

    await skrivHistorikk(supabase, user.id, 'kontant', null, Number(gammelKontant?.saldo ?? 0), oppgjor.saldo)

    // Egen try/catch: skrivingen er fullført, og en kastende revalidatePath
    // skal aldri gjøre den til { ok: false } (#459).
    try {
      revalidatePath('/fond')
      revalidatePath('/fond/rediger')
      revalidatePath('/profil')
      revalidatePath('/', 'layout')
    } catch {
      // Bevisst svelget — best-effort.
    }

    return { ok: true }
  } catch (e) {
    return { ok: false, feil: e instanceof Error ? e.message : 'Ukjent feil ved skriving av oppgjør' }
  }
}

export async function oppdaterKontantSaldo(nySaldo: number) {
  const { supabase, user } = await ensureAdmin()
  validerBelop(nySaldo, 'Saldo')

  // Samme resonnement som saldo-oppslaget i skrivPublisertOppgjor.
  const { data: gammel, error: gammelFeil } = await supabase
    .from('fond_kontant')
    .select('saldo')
    .eq('id', 1)
    .maybeSingle()
  if (gammelFeil) {
    await logg.feil('fond.kontant.oppslag.feilet', gammelFeil)
    throw new Error(`Kunne ikke lese gjeldende saldo for historikk: ${gammelFeil.message}`)
  }

  const { error } = await supabase
    .from('fond_kontant')
    .upsert({ id: 1, saldo: nySaldo, oppdatert: naa() }, { onConflict: 'id' })
  if (error) throw new Error(error.message)

  await skrivHistorikk(supabase, user.id, 'kontant', null, gammel?.saldo ?? 0, nySaldo)
  revalider()
}

// Koblingen står til den slettes, så neste oppgjør matcher automatisk (#571).
// Upsert på api_navn: å koble på nytt retter en feil kobling.
export async function koblNavnTilMedlem(apiNavn: string, profilId: string) {
  const { supabase, user } = await ensureAdmin()

  const navn = apiNavn.trim()
  if (!navn) throw new Error('Navnet fra oppgjøret mangler')

  // matchProfil() hopper over inaktive, så navnet ville blitt uavklart igjen.
  const { data: profil, error: profilFeil } = await supabase
    .from('profiles')
    .select('id, aktiv')
    .eq('id', profilId)
    .maybeSingle()
  if (profilFeil) throw new Error(`Kunne ikke slå opp medlemmet: ${profilFeil.message}`)
  if (!profil) throw new Error('Medlemmet finnes ikke')
  if (!profil.aktiv) throw new Error('Medlemmet er ikke aktivt — velg et aktivt medlem')

  const { error } = await supabase
    .from('fond_navn_alias')
    .upsert(
      { api_navn: navn, profil_id: profilId, opprettet_av: user.id },
      { onConflict: 'api_navn' },
    )
  if (error) throw new Error(`Kunne ikke lagre navnekoblingen: ${error.message}`)

  revalidatePath('/fond/rediger')
}

export async function hentAktiveMedlemmer(): Promise<
  { id: string; navn: string; visningsnavn: string | null }[]
> {
  const { supabase } = await ensureAdmin()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, navn, visningsnavn')
    .eq('aktiv', true)
    .order('navn')
  if (error) throw new Error(`Kunne ikke hente medlemmer: ${error.message}`)
  return data ?? []
}
