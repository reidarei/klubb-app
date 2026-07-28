import { createAdminClient } from '@/lib/supabase/admin'
import { getProfil } from '@/lib/auth-cache'
import { NextRequest, NextResponse } from 'next/server'
import { kanAdministrere } from '@/lib/roller'
import { logg } from '@/lib/logg'

export async function GET(req: NextRequest) {
  // getProfil() kaster nå ved DB-feil (fail-closed). Uten catchen ville en
  // profil-spørringsfeil gitt 500 der ruten før svarte 403 — fanges her så
  // «vet ikke hvem du er» fortsatt betyr «ikke tilgang», ikke «serverfeil».
  const profil = await getProfil().catch(() => null)
  if (!kanAdministrere(profil?.rolle)) return NextResponse.json({ error: 'Ikke tilgang' }, { status: 403 })

  const offset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0')
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '10')

  const admin = createAdminClient()
  const { data, count, error } = await admin
    .from('varsel_logg')
    .select('id, tittel, type, kanal, opprettet, profil_id, profiles (visningsnavn)', { count: 'exact' })
    .order('opprettet', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) {
    // Aldri error.message ut til klienten: PostgREST-meldinger kan bære
    // radverdier («Key (epost)=(x@y.no) already exists»). lib/logg.ts
    // persisterer dem bevisst ikke av samme grunn — se persisterFeilLogg().
    await logg.feil('admin.varsel_logg.hent.feilet', error)
    return NextResponse.json({ error: 'Kunne ikke hente varsel-logg' }, { status: 500 })
  }
  return NextResponse.json({ data: data ?? [], total: count ?? 0 })
}
