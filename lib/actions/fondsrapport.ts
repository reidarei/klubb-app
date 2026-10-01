'use server'

// Fondsrapport (#785) — admin-publisering av kvartalsvis kontantstatus.
// Ingen egne DB-kolonner: tallene fryses inn i selve innleggsteksten (se
// lib/fondsrapport.ts). Disse to actionene henter datagrunnlaget (utkast,
// til forhåndsvisning i arket) og publiserer (bygger rapporten PÅ NYTT på
// serveren — vi stoler aldri på tall en klient sender inn for noe som skal
// fryses permanent).

import { ensureAdmin } from '@/lib/auth'
import { opprettInnleggOgVarsle } from '@/lib/melding-opprett'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { iDagOslo } from '@/lib/dato'
import { INNLEGG_MAKS_LENGDE } from '@/lib/konstanter'
import {
  type Kvartal,
  type Fondsrapport,
  type ForrigeGrunnlag,
  kvartalFor,
  dupliserteProfilIder,
  refFor,
  forrigeKvartal,
  kvartalSlutt,
  lesFondsrapport,
  byggFondsrapport,
  formaterFondsrapport,
  forrigeFraFondsdata,
} from '@/lib/fondsrapport'

type ProfilEmbed = { navn: string | null; visningsnavn: string | null } | null

// Visningsnavn-regelen delt av utkast og publisering: visningsnavn hvis
// satt, ellers fornavnet (split på mellomrom) fra det fulle navnet.
function visningsnavnFor(p: ProfilEmbed): string {
  if (p?.visningsnavn) return p.visningsnavn
  return p?.navn?.split(' ')[0] ?? 'Ukjent'
}

function ordinal(aar: number, kvartal: Kvartal): number {
  return aar * 4 + (kvartal - 1)
}

// Slår en tidligere PUBLISERT rapports linjer (kun ref, ikke profil_id)
// tilbake til et ForrigeGrunnlag nøkket på profil_id — nødvendig fordi
// FondsrapportLinje bevisst kun bærer refen (se lib/fondsrapport.ts).
// En ref uten treff i profilIdByRef (personen finnes ikke lenger i
// profiles-tabellen) hoppes over — hans andel forsvinner fra
// sammenligningsgrunnlaget fremfor å knekke publiseringen.
function forrigeFraPublisertRapport(
  rapport: Fondsrapport,
  profilIdByRef: Map<string, string>,
): ForrigeGrunnlag {
  const perProfilOere: Record<string, number> = {}
  for (const linje of rapport.linjer) {
    const profilId = profilIdByRef.get(linje.ref)
    if (!profilId) continue
    perProfilOere[profilId] = linje.belop * 100
  }
  return {
    aar: rapport.aar,
    kvartal: rapport.kvartal,
    kontanter: rapport.kontanter,
    perProfilOere,
  }
}

// Fellesgrunnlag for både utkast-forhåndsvisning og selve publiseringen —
// hentet FRA SERVEREN begge steder, aldri stolt på fra klienten.
//
// Kvartalet velges ALDRI av admin (#785, review): andelene, saldoen og
// per-datoen er alltid dagens øyeblikksbilde, så kvartalet MÅ være det
// siste oppgjøret tilhører — ellers kunne en «Q2»-rapport fått Q3-tall.
async function hentGrunnlag(supabase: Awaited<ReturnType<typeof ensureAdmin>>['supabase']) {
  const [
    { data: innskudd, error: innskuddFeil },
    { data: bevegelser, error: bevegelserFeil },
    { data: kontant, error: kontantFeil },
    { data: kandidater, error: kandidaterFeil },
    { data: profiler, error: profilerFeil },
  ] = await Promise.all([
    supabase
      .from('fond_innskudd')
      .select('profil_id, dato, belop, oppspart_akkumulert, renteandel_i_fjor, profiles(navn, visningsnavn)'),
    supabase.from('fond_bevegelse').select('profil_id, dato, belop'),
    supabase.from('fond_kontant').select('saldo, oppdatert').eq('id', 1).maybeSingle(),
    // Kandidater til «forrige rapport»: nyeste 20 innlegg som INNEHOLDER en
    // fondsrapport-header — filteret er en grov forhåndssiling (ikke en
    // parse), parseFondsrapport (via lesFondsrapport) avgjør hva som faktisk
    // holder. 20 er rikelig — vi publiserer maks 4 rapporter i året.
    supabase
      .from('meldinger')
      .select('id, innhold, opprettet')
      .ilike('innhold', '%[Fondsrapport Q%')
      .order('opprettet', { ascending: false })
      .limit(20),
    supabase.from('profiles').select('id'),
  ])
  if (innskuddFeil) throw new Error(`Kunne ikke hente innskudd: ${innskuddFeil.message}`)
  if (bevegelserFeil) throw new Error(`Kunne ikke hente fondsbevegelser: ${bevegelserFeil.message}`)
  if (kontantFeil) throw new Error(`Kunne ikke hente kontantsaldo: ${kontantFeil.message}`)
  if (kandidaterFeil) throw new Error(`Kunne ikke hente tidligere rapporter: ${kandidaterFeil.message}`)
  if (profilerFeil) throw new Error(`Kunne ikke hente profiler: ${profilerFeil.message}`)

  const innskuddListe = innskudd ?? []

  const dupliserte = dupliserteProfilIder(innskuddListe.map(r => r.profil_id))
  if (dupliserte.length > 0) {
    const navn = innskuddListe
      .filter(r => dupliserte.includes(r.profil_id))
      .map(r => visningsnavnFor(r.profiles as ProfilEmbed))
    throw new Error(
      `Fondsdataene har flere innskuddsrader for samme person (${[...new Set(navn)].join(', ')}). ` +
        'Rydd opp i innskuddene før rapporten publiseres.',
    )
  }
  const bevegelseListe = (bevegelser ?? []).map(b => ({
    profilId: b.profil_id,
    dato: b.dato,
    belop: Number(b.belop),
  }))
  const saldo = kontant?.saldo ?? 0

  // Oppgjørsdatoen (#785, bindende): max(fond_innskudd.dato), IKKE
  // fond_kontant.oppdatert — kontantsaldoen kan oppdateres oftere/sjeldnere
  // enn selve andels-oppgjøret, og det er andelene rapporten faktisk viser.
  const perDato =
    innskuddListe.length > 0
      ? innskuddListe.reduce((maks, r) => (r.dato > maks ? r.dato : maks), innskuddListe[0].dato)
      : null

  // Ingen innskudd (helt ferskt fond) faller tilbake til dagens kvartal —
  // det finnes ingen oppgjørsdato å utlede fra, og publisering stoppes uansett.
  const { aar: valgtAar, kvartal: valgtKvartal } = kvartalFor(perDato ?? iDagOslo())

  const sumAndeler = innskuddListe.reduce((s, r) => s + Number(r.belop), 0)

  const andeler = innskuddListe.map(r => ({
    profilId: r.profil_id,
    navn: visningsnavnFor(r.profiles as ProfilEmbed),
    // fond_innskudd.belop er allerede den nåværende totalen (bigint, hele
    // kroner) — ikke gjenoppbygd fra oppspart/renteandel/bevegelser slik
    // forrigeFraFondsdata gjør for et TIDLIGERE tidspunkt. *100 er eksakt,
    // ingen avrunding underveis.
    belopOere: Number(r.belop) * 100,
  }))

  const profilIdByRef = new Map(
    (profiler ?? []).map(p => [refFor(p.id), p.id] as const),
  )

  // Finn beste kandidat blant tidligere PUBLISERTE rapporter: nyeste som
  // ligger STRENGT FØR valgt kvartal. `kandidater` er allerede sortert
  // nyest-først, men vi tar likevel maks over hele lista i stedet for å
  // stole på at rekkefølgen aldri kan avvike (publisering skjer ikke
  // nødvendigvis i kronologisk kvartalsrekkefølge).
  let besteKandidat: Fondsrapport | null = null
  let finnesAlleredeForKvartal = false
  for (const m of kandidater ?? []) {
    const lest = lesFondsrapport(m.innhold)
    if (!lest) continue
    if (ordinal(lest.rapport.aar, lest.rapport.kvartal) === ordinal(valgtAar, valgtKvartal)) {
      finnesAlleredeForKvartal = true
    }
    if (ordinal(lest.rapport.aar, lest.rapport.kvartal) >= ordinal(valgtAar, valgtKvartal)) continue
    if (!besteKandidat || ordinal(lest.rapport.aar, lest.rapport.kvartal) > ordinal(besteKandidat.aar, besteKandidat.kvartal)) {
      besteKandidat = lest.rapport
    }
  }

  const forrigeKv = forrigeKvartal(valgtAar, valgtKvartal)
  const forrige: ForrigeGrunnlag = besteKandidat
    ? forrigeFraPublisertRapport(besteKandidat, profilIdByRef)
    : forrigeFraFondsdata({
        innskudd: innskuddListe.map(r => ({
          profilId: r.profil_id,
          dato: r.dato,
          oppsparAkkumulert: Number(r.oppspart_akkumulert),
          renteandelIFjor: Number(r.renteandel_i_fjor),
        })),
        bevegelser: bevegelseListe,
        kvartalSlutt: kvartalSlutt(forrigeKv.aar, forrigeKv.kvartal),
      })

  const sammenlignesMed = besteKandidat
    ? { aar: besteKandidat.aar, kvartal: besteKandidat.kvartal, kilde: 'rapport' as const }
    : { aar: forrigeKv.aar, kvartal: forrigeKv.kvartal, kilde: 'beregnet' as const }

  return {
    aar: valgtAar,
    kvartal: valgtKvartal,
    perDato,
    saldo,
    kontantOppdatert: kontant?.oppdatert ?? null,
    sumAndeler,
    andeler,
    forrige,
    sammenlignesMed,
    finnesAlleredeForKvartal,
  }
}

type Grunnlag = Awaited<ReturnType<typeof hentGrunnlag>>

// Bygger den ferdige rapportblokken fra grunnlaget — delt av utkastet (for
// å kunne si hvor lang hilsenen får være) og publiseringen. Kaster med en
// norsk melding som actionene returnerer som { ok: false, feil }.
function byggBlokk(grunnlag: Grunnlag): string {
  if (!grunnlag.perDato) {
    throw new Error('Fondet har ingen registrerte innskudd ennå — ingenting å publisere')
  }
  const rapport = byggFondsrapport({
    aar: grunnlag.aar,
    kvartal: grunnlag.kvartal,
    perDato: grunnlag.perDato,
    saldo: grunnlag.saldo,
    andeler: grunnlag.andeler,
    forrige: grunnlag.forrige,
  })
  const blokk = formaterFondsrapport(rapport)
  if (blokk.length > INNLEGG_MAKS_LENGDE) {
    throw new Error(`Rapporten alene er lengre enn ${INNLEGG_MAKS_LENGDE} tegn — kan ikke publiseres`)
  }
  return blokk
}

// Plass igjen til hilsenen: blokken deler INNLEGG_MAKS_LENGDE med den, og
// −2 er «\n\n»-skillet mellom hilsen og blokk (se publiserFondsrapport).
function maksHilsenFor(blokk: string): number {
  return Math.max(0, INNLEGG_MAKS_LENGDE - blokk.length - 2)
}

export type FondsrapportUtkast = {
  aar: number
  kvartal: Kvartal
  perDato: string
  saldo: number
  kontantOppdatert: string | null
  sumAndeler: number
  sammenlignesMed: { aar: number; kvartal: Kvartal; kilde: 'rapport' | 'beregnet' }
  finnesAlleredeForKvartal: boolean
  maksHilsen: number
  // Den ferdige rapportblokken (#787) — arket forhåndsviser innlegget akkurat
  // slik det vil se ut via lesFondsrapport(blokk), i stedet for å la admin
  // publisere blindt på sjekklisten alene.
  blokk: string
}

/**
 * Utkastet arket viser før publisering: kvartalet (fra siste oppgjørsdato),
 * hvor ferske tallene er, hva rapporten sammenlignes med, hvor lang
 * hilsenen kan være, og selve rapportblokken til forhåndsvisning.
 *
 * Next maskerer feilmeldinger kastet fra server actions i prod (se
 * lib/actions/fond.ts), så forventede feil returneres som { ok: false, feil }.
 * ensureAdmin() står utenfor try — uautoriserte kall skal propagere.
 */
export async function hentFondsrapportUtkast(): Promise<
  { ok: true; utkast: FondsrapportUtkast } | { ok: false; feil: string }
> {
  const { supabase } = await ensureAdmin()
  try {
    const grunnlag = await hentGrunnlag(supabase)
    const blokk = byggBlokk(grunnlag)
    return {
      ok: true,
      utkast: {
        aar: grunnlag.aar,
        kvartal: grunnlag.kvartal,
        // byggBlokk har allerede kastet hvis perDato mangler
        perDato: grunnlag.perDato as string,
        saldo: grunnlag.saldo,
        kontantOppdatert: grunnlag.kontantOppdatert,
        sumAndeler: grunnlag.sumAndeler,
        sammenlignesMed: grunnlag.sammenlignesMed,
        finnesAlleredeForKvartal: grunnlag.finnesAlleredeForKvartal,
        maksHilsen: maksHilsenFor(blokk),
        blokk,
      },
    }
  } catch (e) {
    return { ok: false, feil: e instanceof Error ? e.message : 'Klarte ikke å hente fondsdata' }
  }
}

/**
 * Publiserer fondsrapporten som et vanlig innlegg. Bygger rapporten PÅ NYTT
 * her (ikke fra klientens forhåndsvisning) — tallene som fryses inn skal
 * alltid være det serveren faktisk regnet ut i publiseringsøyeblikket.
 * Kvartalet tas heller ikke fra klienten, se hentGrunnlag.
 *
 * Duplikat-kvartal sperres bevisst IKKE (avklart i #785): arket
 * advarer, og admin sletter den gamle rapporten selv.
 */
export async function publiserFondsrapport({
  hilsen,
}: {
  hilsen: string
}): Promise<{ ok: false; feil: string }> {
  const { supabase, user } = await ensureAdmin()

  try {
    const grunnlag = await hentGrunnlag(supabase)
    const blokk = byggBlokk(grunnlag)
    const hilsenTrimmet = hilsen.trim()
    const maksHilsen = maksHilsenFor(blokk)
    if (hilsenTrimmet.length > maksHilsen) {
      throw new Error(`Hilsenen kan maks være ${maksHilsen} tegn sammen med rapporten`)
    }
    const innhold = hilsenTrimmet ? `${hilsenTrimmet}\n\n${blokk}` : blokk

    const varselUtdrag = hilsenTrimmet
      ? hilsenTrimmet.length > 80
        ? hilsenTrimmet.slice(0, 77) + '...'
        : hilsenTrimmet
      : `Fondsrapport Q${grunnlag.kvartal} ${grunnlag.aar}`

    await opprettInnleggOgVarsle({
      supabase,
      user,
      tekst: innhold,
      bilder: [],
      albumId: null,
      aktuellDato: null,
      varselUtdrag,
    })
  } catch (e) {
    return { ok: false, feil: e instanceof Error ? e.message : 'Klarte ikke å publisere' }
  }

  // Utenfor try: redirect() kaster NEXT_REDIRECT, som ikke skal fanges som feil.
  revalidatePath('/')
  redirect('/')
}
