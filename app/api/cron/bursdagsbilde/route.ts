// Cron-rute for bursdagsbilde-generering (#641). Kalt av samme GitHub
// Actions-workflow som paaminne (.github/workflows/paaminne.yml), som ETT
// ekstra steg etter varsel-curlen.
//
// To pass per invokasjon:
//   - HOVEDPASS (iMorgen): lager bildet til mannen som har bursdag I MORGEN
//     — dagen FØR, slik at bildet er klart når kortet vises på selve dagen.
//   - NØDPASS (iDag): dekker mannen som av en eller annen grunn ikke fikk
//     bildet sitt i går (f.eks. hovedpasset feilet alle fire slots, eller
//     han ble aktiv/fikk lastet opp profilbilde etter at gårsdagens vindu
//     var over). Kjøres KUN hvis hovedpasset ikke gjorde ekte arbeid denne
//     invokasjonen — se budsjett-resonnementet i handle() under.
// Med fire slots/dag over to dager (i går sitt hovedpass + i dag sitt
// nødpass) er det åtte forsøk på å ha et bilde klart før dagen er omme.
//
// maxDuration = 60 settes KUN her, ikke på den delte paaminne-ruta — en høy
// maxDuration på en rute som IKKE trenger den ville økt cold-start-risikoen
// for alle de andre jobbene som deler den ruta.

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { genererBursdagsbilde, type BursdagsbildeUtfall } from '@/lib/bursdagsbilde-generering'
import { nesteFeiringsdato, tellerSomFeil } from '@/lib/bursdagsbilde'
import type { VertexFeilKlasse } from '@/lib/vertex'
import { finnBursdagsbarn, alderIAar } from '@/lib/bursdag'
import { iDagOslo, iMorgenOslo } from '@/lib/dato'
import { BURSDAGSBILDE_PAA } from '@/lib/config'
import { BURSDAG_VINDU_SLOTS } from '@/lib/konstanter'
import { utledSlotIndex, parseSlotOverride, UgyldigSlotIndexFeil } from '@/lib/cron-slot'
import { logg } from '@/lib/logg'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

type Admin = SupabaseClient<Database>

type Profil = {
  id: string
  visningsnavn: string | null
  navn: string | null
  fodselsdato: string | null
  bilde_url: string | null
  // stikkord finnes i databasetypene (migrasjon 138/139) — ingen cast nødvendig.
  stikkord: string[] | null
}

// Fail-closed (oppdragets krav + Policy: Databasespørringer): en feilet
// mottakerspørring skal ALDRI se bit-identisk ut som «ingen har bursdag i
// dag/morgen» — kastes videre og fanges av try/catch i handle() per pass.
async function hentAktiveProfilerMedFodselsdato(admin: Admin): Promise<Profil[]> {
  const { data, error } = await admin
    .from('profiles')
    .select('id, visningsnavn, navn, fodselsdato, bilde_url, stikkord')
    .eq('aktiv', true)
    .not('fodselsdato', 'is', null)
    // Deterministisk rekkefølge: har to menn bursdag samme dag, skal passet
    // plukke dem i SAMME rekkefølge hver invokasjon. Uten en ordre er
    // PostgREST-rekkefølgen udefinert, og «hvem fikk bildet sitt først»
    // ville variert mellom slots — vanskelig å feilsøke, uten gevinst.
    .order('id')
  if (error) {
    await logg.feil('bursdagsbilde.profiler.feilet', error)
    throw new Error(`Kunne ikke hente profiler: ${error.message}`)
  }
  return data ?? []
}

type PassNavn = 'iMorgen' | 'iDag'

type PassResultat =
  | { pass: PassNavn; utfall: 'ingenBursdag' }
  | { pass: PassNavn; utfall: 'utenProfilbilde'; antall: number }
  | { pass: PassNavn; utfall: 'hoppet'; profilId: string }
  | { pass: PassNavn; utfall: 'ferdig'; profilId: string }
  | { pass: PassNavn; utfall: 'feilet' | 'avvist'; profilId: string; klasse: VertexFeilKlasse }

async function kjorPass(admin: Admin, pass: PassNavn, feiringsdato: string): Promise<PassResultat> {
  const profiler = await hentAktiveProfilerMedFodselsdato(admin)
  const bursdagsbarn = finnBursdagsbarn(profiler, feiringsdato)
  if (bursdagsbarn.length === 0) return { pass, utfall: 'ingenBursdag' }

  const medBilde = bursdagsbarn.filter((p): p is Profil & { bilde_url: string; fodselsdato: string } =>
    Boolean(p.bilde_url && p.fodselsdato),
  )
  if (medBilde.length === 0) return { pass, utfall: 'utenProfilbilde', antall: bursdagsbarn.length }

  // Maks én EKTE generering per pass (budsjettet er ~45 s og maxDuration er
  // 60) — men vi kan ikke bare ta medBilde[0]: med 18 medlemmer er
  // sammenfallende bursdager ~35 % sannsynlig, og er den førstes rad
  // terminal ('ferdig'/'avvist') gir claimet 'hoppet'. Stoppet vi der, fikk
  // mann nummer to ALDRI et bilde, uansett hvor mange slots som gjensto.
  //
  // 'hoppet' koster kun en RPC og bruker ikke av budsjettet, så vi går
  // videre i lista til første utfall som ikke er 'hoppet', og returnerer
  // det. Er alle hoppet, er passet ferdig uten å ha brukt budsjett.
  let sisteHoppet: PassResultat | null = null
  for (const mann of medBilde) {
    const fd = nesteFeiringsdato(mann.fodselsdato, feiringsdato)

    const resultat: BursdagsbildeUtfall = await genererBursdagsbilde(admin, {
      profil: {
        id: mann.id,
        // visningsnavn foran navn — samme kilde som resten av UI-et og som
        // admin-flatens «Generer». Ulik rekkefølge de to stedene ga samme
        // mann forskjellig navn i prompten avhengig av hvem som genererte.
        navn: mann.visningsnavn ?? mann.navn ?? 'Ukjent',
        bildeUrl: mann.bilde_url,
        alder: alderIAar(mann.fodselsdato, fd),
        stikkord: mann.stikkord ?? [],
      },
      feiringsdato: fd,
    })

    if (resultat.utfall === 'hoppet') {
      sisteHoppet = { pass, utfall: 'hoppet', profilId: mann.id }
      continue
    }
    if (resultat.utfall === 'ferdig') return { pass, utfall: 'ferdig', profilId: mann.id }
    return { pass, utfall: resultat.utfall, profilId: mann.id, klasse: resultat.klasse }
  }

  return sisteHoppet ?? { pass, utfall: 'ingenBursdag' }
}

// Gjorde passet ekte arbeid (fetch av profilbilde + Vertex-kall + evt.
// R2-opplasting)? 'ingenBursdag'/'utenProfilbilde'/'hoppet' er alle billige
// DB-oppslag uten noe kall mot Vertex — de bruker ikke av budsjettet.
function gjordeArbeid(resultat: PassResultat): boolean {
  return resultat.utfall === 'ferdig' || resultat.utfall === 'feilet' || resultat.utfall === 'avvist'
}

async function handle(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ feil: 'Uautorisert' }, { status: 401 })
  }

  if (!BURSDAGSBILDE_PAA) {
    return NextResponse.json({ ok: true, utfall: 'av' })
  }

  // Samme slot-vindu som paaminne (delt via lib/cron-slot.ts) — ikke fordi
  // logikken må være identisk, men fordi begge rutene kalles av samme
  // workflow på samme UTC-tider.
  let slotIndex = utledSlotIndex()
  try {
    const override = parseSlotOverride(req.nextUrl.searchParams.get('slotIndex'), BURSDAG_VINDU_SLOTS)
    if (override !== null) slotIndex = override
  } catch (e) {
    if (e instanceof UgyldigSlotIndexFeil) {
      return NextResponse.json({ feil: e.message }, { status: 400 })
    }
    throw e
  }

  const admin = createAdminClient()
  const erSisteSlot = slotIndex === BURSDAG_VINDU_SLOTS - 1

  let hovedResultat: PassResultat | null = null
  // Ukjent om hovedpasset rakk å bruke av budsjettet før det kastet — vi
  // antar «nei» (false) slik at nødpasset likevel får forsøke i stedet for
  // å la dagens bursdagsbarn stå helt uten forsøk denne morgenen.
  let hovedGjordeArbeid = false
  let hovedTellendeFeil = false
  try {
    hovedResultat = await kjorPass(admin, 'iMorgen', iMorgenOslo())
    hovedGjordeArbeid = gjordeArbeid(hovedResultat)
    if (
      (hovedResultat.utfall === 'feilet' || hovedResultat.utfall === 'avvist') &&
      tellerSomFeil(hovedResultat.klasse)
    ) {
      hovedTellendeFeil = true
    }
  } catch (e) {
    await logg.feil('cron.bursdagsbilde.jobb.feilet', e, { ctx: { slot: slotIndex, pass: 'iMorgen' } })
    hovedTellendeFeil = true
  }

  // Maks én generering per invokasjon: budsjettet er ~45 s for ÉN bilde-
  // generering, og maxDuration er 60 s — to fulle genereringer i samme
  // invokasjon ville sprengt veggen. Nødpasset kjører derfor kun hvis
  // hovedpasset IKKE brukte av budsjettet.
  let nodResultat: PassResultat | null = null
  if (!hovedGjordeArbeid) {
    try {
      nodResultat = await kjorPass(admin, 'iDag', iDagOslo())
    } catch (e) {
      await logg.feil('cron.bursdagsbilde.jobb.feilet', e, { ctx: { slot: slotIndex, pass: 'iDag' } })
    }
  }

  // Status-gating: KUN hovedpasset (iMorgen) kan gi 500, og kun på siste
  // slot — nødpasset (iDag) svarer alltid 200 (det er selv en fallback for
  // en dårlig gårsdag, ikke noe som skal eskalere alarmen ytterligere).
  // 'blokkert' teller ikke som feil (tellerSomFeil).
  const status = hovedTellendeFeil && erSisteSlot ? 500 : 200

  return NextResponse.json(
    {
      ok: status === 200,
      slot: slotIndex,
      hovedpass: hovedResultat ?? { pass: 'iMorgen', utfall: 'feilet-kastet' },
      nodpass: nodResultat ?? (hovedGjordeArbeid ? 'hoppet-over-budsjett' : 'feilet-kastet-eller-hoppet'),
    },
    { status },
  )
}

// Vercel Cron / GitHub Actions sender GET eller POST — samme mønster som
// app/api/cron/paaminne/route.ts.
export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}
