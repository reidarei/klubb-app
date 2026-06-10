import { getProfil } from '@/lib/auth-cache'
import { NextRequest, NextResponse } from 'next/server'
import { kanAdministrere } from '@/lib/roller'
import { githubIssuesUrl } from '@/lib/config'

export async function GET(req: NextRequest) {
  const profil = await getProfil()
  if (!kanAdministrere(profil?.rolle)) return NextResponse.json({ error: 'Ikke tilgang' }, { status: 403 })

  const token = process.env.GITHUB_TOKEN
  if (!token) return NextResponse.json({ data: [] })

  const page = parseInt(req.nextUrl.searchParams.get('page') ?? '1')
  const perPage = parseInt(req.nextUrl.searchParams.get('per_page') ?? '10')
  const state = (req.nextUrl.searchParams.get('state') ?? 'closed') as 'open' | 'closed' | 'all'

  const res = await fetch(
    githubIssuesUrl({ state, perPage, page }),
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    }
  )

  if (!res.ok) return NextResponse.json({ data: [] })
  const data = await res.json()

  return NextResponse.json({ data })
}
