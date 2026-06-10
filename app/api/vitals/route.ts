import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Tillat mobil-klienter som bruker navigator.sendBeacon (sender
// text/plain content-type) eller fetch med JSON. Vi parser begge.

const GYLDIGE_METRICS = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'] as const
const GYLDIGE_RATING = ['good', 'needs-improvement', 'poor'] as const
const GYLDIGE_DEVICE = ['mobile', 'tablet', 'desktop'] as const

type Rating = (typeof GYLDIGE_RATING)[number]
type Device = (typeof GYLDIGE_DEVICE)[number]

function parseDevice(ua: string | null): Device | null {
  if (!ua) return null
  const s = ua.toLowerCase()
  if (/ipad|tablet/.test(s)) return 'tablet'
  if (/mobile|android|iphone/.test(s)) return 'mobile'
  return 'desktop'
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, feil: 'Ugyldig JSON' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const { rute, metric, verdi, rating } = body as Record<string, unknown>

  // Validering — avvis alt som ikke matcher. Tabellen har CHECK-constraints
  // som uansett vil avvise ugyldig data, men vi gir tydeligere feil her.
  if (typeof rute !== 'string' || rute.length > 120) {
    return NextResponse.json({ ok: false, feil: 'Ugyldig rute' }, { status: 400 })
  }
  if (typeof metric !== 'string' || !GYLDIGE_METRICS.includes(metric as (typeof GYLDIGE_METRICS)[number])) {
    return NextResponse.json({ ok: false, feil: 'Ugyldig metric' }, { status: 400 })
  }
  if (typeof verdi !== 'number' || !Number.isFinite(verdi) || verdi < 0 || verdi > 600_000) {
    return NextResponse.json({ ok: false, feil: 'Ugyldig verdi' }, { status: 400 })
  }
  const rens = (rating && GYLDIGE_RATING.includes(rating as Rating)) ? (rating as Rating) : null

  const device_type = parseDevice(req.headers.get('user-agent'))

  // Bruk admin-klient for insert siden RLS ikke har insert-policy
  const admin = createAdminClient()
  const { error } = await admin.from('vitals_logg').insert({
    rute,
    metric,
    verdi,
    rating: rens,
    device_type,
  })

  if (error) {
    console.error('[vitals] insert feilet:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 204 })
}
