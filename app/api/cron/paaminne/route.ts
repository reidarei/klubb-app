import { createAdminClient } from '@/lib/supabase/admin'
import { kjorPaaminnelser } from '@/lib/actions/paaminnelser'
import { kjorBursdagsgratulasjon } from '@/lib/actions/bursdagsgratulasjon'
import { kjorBursdagsvarsel } from '@/lib/actions/bursdagsvarsel'
import { BURSDAG_VINDU_SLOTS } from '@/lib/konstanter'
import { utledSlotIndex, parseSlotOverride, UgyldigSlotIndexFeil } from '@/lib/cron-slot'
import { logg } from '@/lib/logg'
import { NextRequest, NextResponse } from 'next/server'

async function handle(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ feil: 'Uautorisert' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Slot-indeks-utregningen (inkl. DST-resonnementet) er flyttet til
  // lib/cron-slot.ts (#641) — delt med app/api/cron/bursdagsbilde/route.ts.
  // Ingen endring i selve utregningen.
  let slotIndex = utledSlotIndex()

  // Manuell override via ?slotIndex=N for testing / manuell triggering.
  // Uten override gjør manuelle kjøringer utenfor cron-slotene ingenting,
  // som gjør det vanskelig å verifisere bursdagsflyten ad-hoc.
  // slotIndex = BURSDAG_VINDU_SLOTS - 1 (siste slot) er garantert-sending-slot:
  // alle bursdagsbarn som ikke alt er postet i dag, postes da uansett.
  try {
    const override = parseSlotOverride(req.nextUrl.searchParams.get('slotIndex'), BURSDAG_VINDU_SLOTS)
    if (override !== null) slotIndex = override
  } catch (e) {
    if (e instanceof UgyldigSlotIndexFeil) {
      return NextResponse.json({ feil: e.message }, { status: 400 })
    }
    throw e
  }

  // De tre jobbene under er uavhengige, og hver av dem er innkapslet i sin
  // egen try/catch. Uten det er uavhengigheten kun en påstand i en kommentar:
  // et kast i en tidligere jobb ville boblet ut av handleren og hoppet over
  // resten — for bursdagsvarselet ville det skjedd på ALLE slots, siden
  // gratulasjonen kjører i samme vindu. En kastet jobb telles som én feil i
  // sin egen teller og går inn i den vanlige status-gatingen under.
  let paaminnerFeil = 0
  let bursdagFeil = 0
  let bursdagsvarselFeil = 0

  // Påminnelser kjøres kun ved slot 1 (06 UTC = 08 norsk sommer / 07 vinter)
  let paaminneResult: Awaited<ReturnType<typeof kjorPaaminnelser>> | null = null
  if (slotIndex === 1) {
    try {
      paaminneResult = await kjorPaaminnelser(admin)
      paaminnerFeil = paaminneResult.feil
    } catch (e) {
      await logg.feil('cron.paaminne.jobb.feilet', e, { ctx: { slot: slotIndex } })
      paaminnerFeil = 1
    }
  }

  // Bursdagsgratulasjonar kjøres ved alle slots i vinduet (0–3)
  let bursdagResult: Awaited<ReturnType<typeof kjorBursdagsgratulasjon>> | null = null
  if (slotIndex >= 0 && slotIndex < BURSDAG_VINDU_SLOTS) {
    try {
      bursdagResult = await kjorBursdagsgratulasjon(admin, {
        slotIndex,
        totalSlots: BURSDAG_VINDU_SLOTS,
      })
      bursdagFeil = bursdagResult.feil
    } catch (e) {
      await logg.feil('cron.bursdagsgratulasjon.jobb.feilet', e, { ctx: { slot: slotIndex } })
      bursdagFeil = 1
    }
  }

  // Bursdagsvarsel til «de andre» (#638) — egen kodesti, uavhengig av
  // bursdagResult over. Kjøres på samme slots av samme grunn (sannsynlighets-
  // styrt sending i gratulasjonen har ingen betydning her, men vinduet 0–3
  // er felles morgen-vinduet begge jobbene skal operere i).
  let bursdagsvarselResult: Awaited<ReturnType<typeof kjorBursdagsvarsel>> | null = null
  if (slotIndex >= 0 && slotIndex < BURSDAG_VINDU_SLOTS) {
    try {
      bursdagsvarselResult = await kjorBursdagsvarsel(admin)
      bursdagsvarselFeil = bursdagsvarselResult.feil
    } catch (e) {
      await logg.feil('cron.bursdagsvarsel.jobb.feilet', e, { ctx: { slot: slotIndex } })
      bursdagsvarselFeil = 1
    }
  }

  // Gating per jobb, ikke ruten som helhet (#504): paaminner kjører KUN på
  // slot 1 og har ingen senere sjanse samme dag — enhver feil der skal gi
  // rødt med én gang. Bursdag og bursdagsvarsel kjører derimot på alle slots
  // og får nye sjanser resten av dagen — kun terminal (siste slot) skal
  // gjøre rødt.
  const erSisteSlot = slotIndex === BURSDAG_VINDU_SLOTS - 1
  const status =
    paaminnerFeil > 0 || ((bursdagFeil > 0 || bursdagsvarselFeil > 0) && erSisteSlot) ? 500 : 200
  return NextResponse.json(
    {
      ok: status === 200,
      slot: slotIndex,
      paaminne: paaminneResult ?? 'hoppet',
      bursdag: bursdagResult ?? 'utenfor vindu',
      bursdagsvarsel: bursdagsvarselResult ?? 'utenfor vindu',
      paaminnerFeil,
      bursdagFeil,
      bursdagsvarselFeil,
    },
    { status },
  )
}

// Vercel Cron sender GET-requests
export async function GET(req: NextRequest) {
  return handle(req)
}

// Behold POST for manuell triggering
export async function POST(req: NextRequest) {
  return handle(req)
}
