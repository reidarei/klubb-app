'use server'

import { ensureAdmin } from '@/lib/auth'
import { naa } from '@/lib/dato'
import { revalidatePath } from 'next/cache'
import { logg } from '@/lib/logg'

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
  husleie_i_aar: number
  driftskostnader_i_aar: number
}) {
  const { supabase } = await ensureAdmin()
  validerNavn(input.navn)
  validerBelop(input.markedsverdi, 'Markedsverdi')
  validerBelop(input.anskaffelsesverdi, 'Anskaffelsesverdi')
  validerBelop(input.husleie_i_aar, 'Husleie i år')
  // Driftskostnader lagres POSITIVT og trekkes fra i visningen — samme
  // kontrakt som check-constrainten i migrasjon 129.
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
  // Driftskostnader lagres POSITIVT og trekkes fra i visningen — samme
  // kontrakt som check-constrainten i migrasjon 129.
  validerBelop(input.driftskostnader_i_aar, 'Driftskostnader i år')

  // Les gammel markedsverdi før oppdatering for historikk-logging. Kaster FØR
  // selve oppdateringen: skriver vi den nye verdien uten å ha fått lest den
  // gamle, mister vi sporet av en pengeendring permanent — verre enn å be
  // brukeren prøve igjen (se CLAUDE.md § pulje A, fond.ts-vurderingen).
  // maybeSingle (ikke single): «raden er borte» skal ha sin egen norske
  // melding, ikke drukne i PostgREST-ens PGRST116-tekst.
  const { data: gammel, error: gammelFeil } = await supabase
    .from('fond_eiendom')
    .select('markedsverdi')
    .eq('id', input.id)
    .maybeSingle()
  if (gammelFeil) {
    await logg.feil('fond.eiendom.oppslag.feilet', gammelFeil, { ctx: { code: gammelFeil.code } })
    throw new Error(`Kunne ikke lese gjeldende markedsverdi for historikk: ${gammelFeil.message}`)
  }
  // Raden er slettet av noen andre mens skjemaet sto åpent: update-en under
  // ville vært en stille no-op som ser ut som suksess. Si det som det er.
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

  // Logg historikk før sletting: uten en 0-rad får den fremtidige utviklingsgrafen
  // et usynlig hopp der eiendommens verdi bare forsvinner. Les siste verdi, så slett —
  // kilde_id har ingen FK til kildetabellen, så rekkefølgen er ikke constraint-tvunget.
  // Kaster FØR sletting hvis oppslaget feiler — sletter vi likevel mister vi
  // historikk-raden for godt (samme resonnement som oppdaterEiendom over).
  // Men sletting skal være IDEMPOTENT: er raden alt borte (to admins, eller
  // to faner, på /fond) er utfallet brukeren ba om allerede sant, og da skal
  // han ikke få en rød feil på en stale liste som aldri blir revalidert.
  const { data: gammel, error: gammelFeil } = await supabase
    .from('fond_eiendom')
    .select('markedsverdi')
    .eq('id', id)
    .maybeSingle()
  if (gammelFeil) {
    await logg.feil('fond.eiendom.oppslag.feilet', gammelFeil, { ctx: { code: gammelFeil.code } })
    throw new Error(`Kunne ikke lese gjeldende markedsverdi for historikk: ${gammelFeil.message}`)
  }
  // Ingen rad = ingen ny historikk å skrive (0-raden ble skrevet av den som
  // slettet først). Fortsett til delete-en, som blir en no-op, og revalider.
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

  // Samme historikk-resonnement som oppdaterEiendom over — kaster FØR
  // oppdateringen hvis vi ikke får lest gammel verdi, og maybeSingle så
  // «raden er borte» får sin egen melding i stedet for PGRST116.
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

  // Logg historikk før sletting — se kommentar i slettEiendom for hvorfor (graf-kontinuitet).
  // Kaster FØR sletting hvis oppslaget feiler, men er idempotent når raden alt
  // er borte — se samme resonnement i slettEiendom.
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
    // Detaljpakken fra kilden. null = eldre API-svar uten detaljer.
    //
    // VIKTIG: HentOppgjor.tsx bygger skrive-payloaden på nytt FRA DENNE DTO-en,
    // ikke fra JSON-en som ble hentet. Alt som ikke ligger her forsvinner stille
    // mellom «Hent» og «Skriv», uten en eneste feilmelding. Legger du til et nytt
    // felt i oppgjørs-kontrakten, må det inn her også — ellers hentes det og
    // skrives aldri. Pinnet i __tests__/fond-oppgjor-dto.test.ts.
    detaljer: {
      oppspart_akkumulert: number
      renteandel_i_fjor: number
      bevegelser: { dato: string; belop: number }[]
    } | null
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

    // Hent alle aktive profiler for å matche visningsnavn → profil_id. Kaster
    // på feil i stedet for å falle gjennom til profilListe=[] — ellers ville
    // matchProfil() under feiltolket EN DB-feil som «ukjent visningsnavn» for
    // hver eneste andel i oppgjøret, en villedende feilmelding.
    const { data: profiler, error: profilerFeil } = await supabase
      .from('profiles')
      .select('id, visningsnavn')
      .eq('aktiv', true)
    if (profilerFeil) {
      await logg.feil('fond.oppgjor.profiler.feilet', profilerFeil)
      throw new Error(`Kunne ikke hente profiler for oppgjøret: ${profilerFeil.message}`)
    }

    const profilListe = profiler ?? []

    // Bygg opp én rad per andel; ukjent navn → kast umiddelbart
    const raderUtenAppVerdi: {
      profil_id: string
      visningsnavn: string
      hentetVerdi: number
      detaljer: OppgjorDiff['rader'][number]['detaljer']
    }[] = []

    const { harDetaljer } = await import('@/lib/fond-oppgjor')

    for (const andel of oppgjor.andeler) {
      const match = matchProfil(profilListe, andel.visningsnavn)
      raderUtenAppVerdi.push({
        profil_id: match.id,
        visningsnavn: andel.visningsnavn,
        hentetVerdi: andel.belop,
        // Pakke-regelen er alt håndhevet i validerOppgjor, så dette er enten
        // hele pakken eller ingenting — aldri en halv.
        detaljer: harDetaljer(andel)
          ? {
              oppspart_akkumulert: andel.oppspart_akkumulert,
              renteandel_i_fjor: andel.renteandel_i_fjor,
              bevegelser: andel.bevegelser,
            }
          : null,
      })
    }

    // Hent alle innskudd-rader og kontant-saldo fra appen. Dette er
    // grunnlaget for diff-visningen admin bruker til å bestemme om oppgjøret
    // skal skrives — en svelget feil her ville vist «ingen rad enda» for ALLE
    // medlemmer i stedet for de faktiske appVerdi-ene, og kunne fått admin til
    // å tro et helt oppgjør manglet når det egentlig var en forbigående feil.
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

    // Samme resonnement som i hentPublisertOppgjor over: kast på feil i
    // stedet for å la matchProfil() feiltolke den som «ukjent visningsnavn».
    const { data: profiler, error: profilerFeil } = await supabase
      .from('profiles')
      .select('id, visningsnavn')
      .eq('aktiv', true)
    if (profilerFeil) {
      await logg.feil('fond.oppgjor.profiler.feilet', profilerFeil)
      throw new Error(`Kunne ikke hente profiler for oppgjøret: ${profilerFeil.message}`)
    }

    const profilListe = profiler ?? []

    // Match alle andeler til profiler — kast hvis ukjent eller tvetydig navn
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
      const match = matchProfil(profilListe, andel.visningsnavn)
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

    // Sjekk at ingen profil har flere innskudd-rader — kast FØR første skriving.
    // En svelget feil her ville gitt alleRader=[] og latt duplikat-sjekken
    // under passere stille selv om duplikater faktisk fantes — nøyaktig
    // sikkerhetsnettet kommentaren over lover at vi har.
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

    // Skriv andeler — upsert per profil (update hvis rad finnes, insert ellers).
    // snapshot_dato overstyrer alltid dato — det er snapshot-semantikken (#453).
    for (const m of matchede) {
      // Fjorårstallene skrives sammen med totalen. Mangler detaljpakken (eldre
      // API-svar), nullstilles de bevisst framfor å bli stående: da ville en
      // gammel oppdeling overlevd et nytt oppgjør og sluttet å summere seg til
      // den nye totalen — nøyaktig løgnen invarianten skal hindre.
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

    // Bevegelsene: én RPC som gjør slett-så-sett-inn atomisk per person (se
    // migrasjon 126). Kalles kun når kilden faktisk sendte detaljer — et eldre
    // API-svar skal IKKE tørke ut bevegelser som alt ligger i appen.
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

    // Skriv saldo via skrivHistorikk-logikken fra oppdaterKontantSaldo (historikk-logging inkludert).
    // maybeSingle (ikke single): singletonen kan legitimt mangle før første
    // gangs seeding — det skal IKKE kaste. En ekte feil skal det derimot, for
    // uten det ville skrivHistorikk() under logget «endret fra 0» selv om
    // reell gammel saldo var ukjent, og forfalsket regnskapshistorikken.
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

  // Les gammel saldo; kan mangle hvis singleton ikke er seeded enda —
  // maybeSingle håndterer det som en legitim null, ikke en feil (se samme
  // resonnement i skrivPublisertOppgjor over). En ekte feil skal fortsatt
  // kaste, ellers logges «endret fra 0» i historikken selv om reell gammel
  // saldo var ukjent.
  const { data: gammel, error: gammelFeil } = await supabase
    .from('fond_kontant')
    .select('saldo')
    .eq('id', 1)
    .maybeSingle()
  if (gammelFeil) {
    await logg.feil('fond.kontant.oppslag.feilet', gammelFeil)
    throw new Error(`Kunne ikke lese gjeldende saldo for historikk: ${gammelFeil.message}`)
  }

  // UPSERT: insert hvis rad ikke finnes, update ellers
  const { error } = await supabase
    .from('fond_kontant')
    .upsert({ id: 1, saldo: nySaldo, oppdatert: naa() }, { onConflict: 'id' })
  if (error) throw new Error(error.message)

  await skrivHistorikk(supabase, user.id, 'kontant', null, gammel?.saldo ?? 0, nySaldo)
  revalider()
}
