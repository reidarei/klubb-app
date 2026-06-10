import { createAdminClient } from '@/lib/supabase/admin'
import { getProfil } from '@/lib/auth-cache'
import { NextRequest, NextResponse } from 'next/server'
import { kanAdministrere } from '@/lib/roller'

export async function GET(req: NextRequest) {
  const profil = await getProfil()
  if (!kanAdministrere(profil?.rolle)) return NextResponse.json({ error: 'Ikke tilgang' }, { status: 403 })

  const offset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0')
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '10')

  const admin = createAdminClient()
  const { data, count } = await admin
    .from('varsel_logg')
    .select('id, tittel, type, kanal, opprettet, profil_id, profiles (visningsnavn)', { count: 'exact' })
    .order('opprettet', { ascending: false })
    .range(offset, offset + limit - 1)

  return NextResponse.json({ data: data ?? [], total: count ?? 0 })
}
