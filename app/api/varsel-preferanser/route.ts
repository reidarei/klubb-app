import { createServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { naa } from '@/lib/dato'
import { logg } from '@/lib/logg'

export async function PUT(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ikke innlogget' }, { status: 401 })

  const body = await req.json()
  const oppdatering: Record<string, unknown> = { oppdatert: naa() }

  if (typeof body.push_aktiv === 'boolean') oppdatering.push_aktiv = body.push_aktiv
  if (typeof body.epost_aktiv === 'boolean') oppdatering.epost_aktiv = body.epost_aktiv
  // #614: nivået styrer om lavsignal-varsler (chat) i det hele tatt får lov
  // til å gå på push/epost — valideres server-side, ikke stol på klienten
  // (jf. check-constraint på kolonnen, mig. 135).
  if (body.varsel_nivaa === 'viktige' || body.varsel_nivaa === 'alle') {
    oppdatering.varsel_nivaa = body.varsel_nivaa
  } else if (body.varsel_nivaa !== undefined) {
    return NextResponse.json({ error: 'Ugyldig varsel_nivaa' }, { status: 400 })
  }

  const { error } = await supabase
    .from('varsel_preferanser')
    .upsert({ profil_id: user.id, ...oppdatering }, { onConflict: 'profil_id' })
  // En feilet lagring skal ikke se ut som suksess (§ Policy: Databasespørringer).
  // Loggen er hele poenget: uten den forsvinner en 500 her sporløst, og
  // medlemmet tror han skrudde av chat-plinget mens han fortsatt blir pinget.
  // Postgres-meldingen er loggtekst, ikke UI-tekst — klienten får en generisk.
  if (error) {
    await logg.feil('varsel.preferanser.lagring.feilet', error, {
      ctx: { profil_id: user.id, code: error.code },
    })
    return NextResponse.json({ error: 'Kunne ikke lagre' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
