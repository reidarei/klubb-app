import { createAdminClient } from '@/lib/supabase/admin'
import { kjorPaaminnelser } from '@/lib/actions/paaminnelser'
import { kjorBursdagsgratulasjon } from '@/lib/actions/bursdagsgratulasjon'
import { BURSDAG_VINDU_SLOTS } from '@/lib/konstanter'
import { NextRequest, NextResponse } from 'next/server'

async function handle(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ feil: 'Uautorisert' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Beregn slot-indeks fra UTC-time. Cron-tidene er i UTC (5,6,7,8) — å regne
  // fra norsk lokaltid ble feil ved DST-overgang fordi vinter-cron (06 UTC)
  // blir 07 norsk og slotIndex ble 0 i stedet for 1 (se #328-review).
  //   Slot 0: 05 UTC = 07 norsk sommer / 06 norsk vinter
  //   Slot 1: 06 UTC = 08 norsk sommer / 07 norsk vinter ← påminnelses-gating
  //   Slot 2: 07 UTC = 09 norsk sommer / 08 norsk vinter
  //   Slot 3: 08 UTC = 10 norsk sommer / 09 norsk vinter (siste sjanse)
  // Påminnelser sendes derfor alltid kl. 07/08 norsk uansett DST. På vinter
  // faller bursdagsvinduet 06–09 norsk litt utenfor det ideelle 07–10, men
  // siste slot (09 norsk) garanterer fortsatt sending.
  const utcTime = new Date().getUTCHours()
  let slotIndex = utcTime - 5 // 0-basert; utenfor vinduet kan gi negativ/for høy verdi

  // Manuell override via ?slotIndex=N for testing / manuell triggering.
  // Uten override gjør manuelle kjøringer utenfor cron-slotene ingenting,
  // som gjør det vanskelig å verifisere bursdagsflyten ad-hoc.
  // slotIndex = BURSDAG_VINDU_SLOTS - 1 (siste slot) er garantert-sending-slot:
  // alle bursdagsbarn som ikke alt er postet i dag, postes da uansett.
  const slotOverride = req.nextUrl.searchParams.get('slotIndex')
  if (slotOverride !== null) {
    const n = Number(slotOverride)
    if (!Number.isInteger(n) || n < 0 || n >= BURSDAG_VINDU_SLOTS) {
      return NextResponse.json(
        {
          feil: `Ugyldig slotIndex: må være heltall i området 0..${BURSDAG_VINDU_SLOTS - 1}`,
        },
        { status: 400 },
      )
    }
    slotIndex = n
  }

  // Påminnelser kjøres kun ved slot 1 (06 UTC = 08 norsk sommer / 07 vinter)
  let paaminneResult: Awaited<ReturnType<typeof kjorPaaminnelser>> | null = null
  if (slotIndex === 1) {
    paaminneResult = await kjorPaaminnelser(admin)
  }

  // Bursdagsgratulasjonar kjøres ved alle slots i vinduet (0–3)
  let bursdagResult: Awaited<ReturnType<typeof kjorBursdagsgratulasjon>> | null = null
  if (slotIndex >= 0 && slotIndex < BURSDAG_VINDU_SLOTS) {
    bursdagResult = await kjorBursdagsgratulasjon(admin, {
      slotIndex,
      totalSlots: BURSDAG_VINDU_SLOTS,
    })
  }

  const paaminnerFeil = paaminneResult?.feil ?? 0
  const bursdagFeil = bursdagResult?.feil ?? 0

  // Gating per jobb, ikke ruten som helhet (#504): paaminner kjører KUN på
  // slot 1 og har ingen senere sjanse samme dag — enhver feil der skal gi
  // rødt med én gang. Bursdag kjører derimot på alle slots og får nye
  // sjanser resten av dagen — kun terminal (siste slot) skal gjøre rødt.
  const erSisteSlot = slotIndex === BURSDAG_VINDU_SLOTS - 1
  const status = paaminnerFeil > 0 || (bursdagFeil > 0 && erSisteSlot) ? 500 : 200
  return NextResponse.json(
    {
      ok: status === 200,
      slot: slotIndex,
      paaminne: paaminneResult ?? 'hoppet',
      bursdag: bursdagResult ?? 'utenfor vindu',
      paaminnerFeil,
      bursdagFeil,
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
