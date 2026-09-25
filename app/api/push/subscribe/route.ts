import { createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { logg } from '@/lib/logg'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })

  const { endpoint, keys } = await req.json()
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Ugyldig subscription' }, { status: 400 })
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    { profil_id: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    { onConflict: 'endpoint' }
  )
  if (error) {
    await logg.feil('push.abonnement.lagring.feilet', error, { ctx: { profil_id: user.id, code: error.code } })
    return NextResponse.json({ error: 'Kunne ikke lagre' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })

  const { endpoint } = await req.json()
  const { error } = await supabase.from('push_subscriptions').delete()
    .eq('endpoint', endpoint)
    .eq('profil_id', user.id)
  if (error) {
    await logg.feil('push.abonnement.sletting.feilet', error, { ctx: { profil_id: user.id, code: error.code } })
    return NextResponse.json({ error: 'Kunne ikke slette' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
