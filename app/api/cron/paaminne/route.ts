import { createAdminClient } from '@/lib/supabase/admin'
import { kjorPaaminnelser } from '@/lib/actions/paaminnelser'
import { NextRequest, NextResponse } from 'next/server'

async function handle(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ feil: 'Uautorisert' }, { status: 401 })
  }

  const admin = createAdminClient()
  const result = await kjorPaaminnelser(admin)
  // Returner 500 hvis noe feilet — synliggjør cron-feil i GitHub Actions-loggen
  // i stedet for å skjule dem bak en 200.
  const status = result.feil > 0 ? 500 : 200
  return NextResponse.json({ ok: result.feil === 0, ...result }, { status })
}

// Vercel Cron sender GET-requests
export async function GET(req: NextRequest) {
  return handle(req)
}

// Behold POST for manuell triggering
export async function POST(req: NextRequest) {
  return handle(req)
}
