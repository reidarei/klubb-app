import { createClient } from '@supabase/supabase-js'
import { randomInt } from 'node:crypto'
import { sendEpost, velkommenEpostHtml } from '@/lib/epost'
import { NextResponse } from 'next/server'
import { ensureAdmin } from '@/lib/auth'
import { BASE_URL } from '@/lib/config'
import { KLUBB_NAVN } from '@/lib/klubb-config'
import { logg } from '@/lib/logg'

function genererPassord() {
  const tegn = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  // CSPRNG (randomInt) — passord skal ikke genereres med Math.random, se #411
  return Array.from({ length: 12 }, () => tegn[randomInt(tegn.length)]).join('')
}

export async function POST(request: Request) {
  // Verifiser at kaller er admin — ensureAdmin kaster ved manglende auth/rolle,
  // vi fanger og returnerer riktig HTTP-status
  try {
    await ensureAdmin()
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Feil'
    if (msg === 'Ikke innlogget') return NextResponse.json({ feil: msg }, { status: 401 })
    return NextResponse.json({ feil: msg }, { status: 403 })
  }

  const { navn: rawNavn, epost: rawEpost } = await request.json()
  const navn = (rawNavn ?? '').trim()
  const epost = (rawEpost ?? '').trim().toLowerCase()
  if (!navn || !epost) return NextResponse.json({ feil: 'Mangler navn eller e-post' }, { status: 400 })

  // Bruk service-role for å opprette bruker
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const passord = genererPassord()

  const { data, error } = await adminClient.auth.admin.createUser({
    email: epost,
    password: passord,
    email_confirm: true,
  })

  if (error) return NextResponse.json({ feil: error.message }, { status: 400 })

  // Sett navn/visningsnavn. Auth-brukeren finnes alt, så feil logges i stedet
  // for å kastes — admin må uansett få passordet (#760).
  const visningsnavn = navn.split(' ')[0]
  const { error: profilFeil } = await adminClient
    .from('profiles')
    .update({ navn, visningsnavn })
    .eq('id', data.user.id)
  if (profilFeil) {
    await logg.feil('admin.opprett_medlem.profil.feilet', profilFeil, {
      ctx: { code: profilFeil.code, profil_id: data.user.id },
    })
  }

  // Send velkomst-e-post med innloggingsinfo
  await sendEpost({
    til: epost,
    emne: `Velkommen til ${KLUBB_NAVN}`,
    html: velkommenEpostHtml({
      navn,
      epost,
      passord,
      loggInnUrl: `${BASE_URL}/login`,
    }),
  })

  return NextResponse.json({ ok: true, passord })
}
