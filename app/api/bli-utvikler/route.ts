import { createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { GITHUB_REPO, GITHUB_ONSKE_LABEL } from '@/lib/config'

// Ingen non-null assertion: GITHUB_TOKEN er en valgfri integrasjon, og en
// instans uten den skal degradere pent — ikke krasje (#299).
const GITHUB_TOKEN = process.env.GITHUB_TOKEN

export async function POST(request: Request) {
  if (!GITHUB_TOKEN) {
    return NextResponse.json(
      { feil: 'Innspill-funksjonen er ikke konfigurert (GITHUB_TOKEN mangler)' },
      { status: 503 }
    )
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ feil: 'Ikke innlogget' }, { status: 401 })

  const { data: profil } = await supabase
    .from('profiles')
    .select('visningsnavn, navn')
    .eq('id', user.id)
    .single()

  const navn = profil?.visningsnavn ?? profil?.navn ?? 'Ukjent'

  const { tekst } = await request.json()
  if (typeof tekst !== 'string' || tekst.trim().length < 5) {
    return NextResponse.json({ feil: 'Ønsket er for kort' }, { status: 400 })
  }

  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: tekst.trim().length > 80
        ? tekst.trim().slice(0, 77) + '...'
        : tekst.trim(),
      body: `## Ønske fra ${navn}\n\n${tekst.trim()}\n\n<!-- profil_id:${user.id} -->`,
      labels: [GITHUB_ONSKE_LABEL],
    }),
  })

  if (!res.ok) {
    const feil = await res.text()
    console.error('GitHub Issue feilet:', feil)
    return NextResponse.json({ feil: 'Kunne ikke opprette ønske' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
