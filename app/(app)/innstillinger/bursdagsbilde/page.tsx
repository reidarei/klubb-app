import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/database.types'
import { getProfil } from '@/lib/auth-cache'
import { kanAdministrere } from '@/lib/roller'
import { iDagOslo } from '@/lib/dato'
// Delt dato-utledning — samme funksjon cron bruker, med samme skuddårsregel
// (lib/bursdag.ts). En egen kopi her bygget «YYYY-02-29» i et ikke-skuddår:
// en ugyldig `date` for Postgres, og en nøkkel som aldri traff raden cron
// hadde skrevet på 1. mars — altså var admin-sletting, den ENESTE kontrollen
// mot et dårlig bilde, brutt for nettopp den mannen.
import { nesteFeiringsdato } from '@/lib/bursdagsbilde'
import { BURSDAGSBILDE_PAA, GOOGLE_CLOUD_LOCATION, GOOGLE_VERTEX_MODELL } from '@/lib/config'
import BursdagsbildeRad from './BursdagsbildeRad'

// Server actions kalt fra denne ruta (genererBursdagsbildeNaa) arver
// rute-segmentets maxDuration — samme 60 s som cron-ruta, siden ett ekte
// Vertex-kall kan ta opp mot BURSDAGSBILDE_BUDSJETT_MODELL_MS.
export const maxDuration = 60

type Medlem = {
  id: string
  navn: string | null
  visningsnavn: string | null
  bilde_url: string | null
  fodselsdato: string
}

// Avledet av de genererte typene (migrasjon 140), ikke skrevet av for hånd:
// endres en kolonne i skjemaet, blir det en kompileringsfeil her.
type BildeRad = Pick<
  Database['public']['Tables']['bursdagsbilde']['Row'],
  'profil_id' | 'feiringsdato' | 'status' | 'forsok' | 'siste_feil' | 'bilde_url'
>

export default async function BursdagsbildeSide() {
  const [supabase, profil] = await Promise.all([createServerClient(), getProfil()])

  // Admin-only (ikke generalsekretær-only) — bursdagsbilde er ikke sensitivt
  // på samme måte som pass-tilgang, og løftet i /om-appen navngir ikke en
  // bestemt rolle for denne funksjonen.
  if (!kanAdministrere(profil?.rolle)) redirect('/innstillinger')

  const iDag = iDagOslo()

  const { data: medlemmer, error: medlemmerFeil } = await supabase
    .from('profiles')
    .select('id, navn, visningsnavn, bilde_url, fodselsdato')
    .eq('aktiv', true)
    .not('fodselsdato', 'is', null)
  if (medlemmerFeil) throw new Error(`Kunne ikke hente medlemmer: ${medlemmerFeil.message}`)

  const rader = ((medlemmer ?? []) as Medlem[])
    .map(m => ({ medlem: m, feiringsdato: nesteFeiringsdato(m.fodselsdato, iDag) }))
    .sort((a, b) => a.feiringsdato.localeCompare(b.feiringsdato))

  // Admin-klient KUN for bursdagsbilde-oppslaget: `authenticated` har bare
  // select på (profil_id, feiringsdato, aar, status, bilde_url) — migrasjon
  // 140 gir bevisst IKKE `forsok`/`siste_feil` til vanlige innloggede, og
  // denne siden er nettopp stedet de skal være synlige for en admin.
  const admin = createAdminClient()
  const { data: bilderRaw, error: bilderFeil } = await admin
    .from('bursdagsbilde')
    .select('profil_id, feiringsdato, status, forsok, siste_feil, bilde_url')
    .in('profil_id', rader.map(r => r.medlem.id))
  if (bilderFeil) throw new Error(`Kunne ikke hente bursdagsbilder: ${bilderFeil.message}`)

  const bildePerNokkel = new Map<string, BildeRad>()
  for (const b of bilderRaw ?? []) {
    bildePerNokkel.set(`${b.profil_id}:${b.feiringsdato}`, b)
  }

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <header style={{ marginTop: 12, marginBottom: 22 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 600,
            color: 'var(--text-tertiary)',
            letterSpacing: '1.6px',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}
        >
          Innstillinger
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: '-0.4px',
            margin: 0,
            color: 'var(--text-primary)',
          }}
        >
          Bursdagsbilde
        </h1>
      </header>

      <div
        style={{
          padding: '12px 14px',
          marginBottom: 20,
          borderRadius: 10,
          border: '0.5px solid var(--border)',
          background: 'var(--bg-elevated)',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--text-tertiary)',
          letterSpacing: '0.4px',
        }}
      >
        Funksjon: {BURSDAGSBILDE_PAA ? 'PÅ' : 'AV'} · location: {GOOGLE_CLOUD_LOCATION || '—'} · modell:{' '}
        {GOOGLE_VERTEX_MODELL}
      </div>

      <p
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 13,
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
          margin: '0 0 16px',
        }}
      >
        Cron lager bildet dagen før bursdagen. «Generer» her tvinger en
        (re)generering for mannens NESTE feiringsdato — trykker du dette et
        halvt år før hans bursdag, er det det bildet som vises da. Sletter du
        et bilde, regenererer cron det aldri av seg selv.
      </p>

      <div>
        {rader.map(({ medlem, feiringsdato }, i) => {
          const bilde = bildePerNokkel.get(`${medlem.id}:${feiringsdato}`)
          return (
            <BursdagsbildeRad
              key={medlem.id}
              profilId={medlem.id}
              navn={medlem.visningsnavn ?? medlem.navn ?? 'Ukjent'}
              feiringsdato={feiringsdato}
              harProfilbilde={Boolean(medlem.bilde_url)}
              status={bilde?.status ?? null}
              forsok={bilde?.forsok ?? 0}
              sisteFeil={bilde?.siste_feil ?? null}
              bildeUrl={bilde?.status === 'ferdig' ? bilde.bilde_url : null}
              siste={i === rader.length - 1}
            />
          )
        })}
      </div>
    </div>
  )
}
