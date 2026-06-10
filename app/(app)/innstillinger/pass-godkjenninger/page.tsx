import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { getProfil } from '@/lib/auth-cache'
import { kanAdministrere } from '@/lib/roller'
import GodkjenningRad from './GodkjenningRad'

type ForespørselRad = {
  id: string
  status: string
  opprettet: string
  soker: { id: string; navn: string | null; visningsnavn: string | null } | null
  eier: { id: string; navn: string | null; visningsnavn: string | null } | null
  arrangement: { id: string; tittel: string; start_tidspunkt: string } | null
}

export default async function PassGodkjenningerSide() {
  const [supabase, profil] = await Promise.all([createServerClient(), getProfil()])

  // Tilgang: bare admin/generalsekretær. RLS på pass_tilgang_forespørsel
  // sørger for at andre uansett ikke får UPDATE-tilgang, men vi skjuler
  // hele siden også for å unngå tomme lister i UI.
  if (!kanAdministrere(profil?.rolle)) {
    redirect('/innstillinger')
  }

  const { data, error } = await supabase
    .from('pass_tilgang_forespørsel')
    .select(
      `id, status, opprettet,
       soker:profiles!pass_tilgang_forespørsel_soker_id_fkey (id, navn, visningsnavn),
       eier:profiles!pass_tilgang_forespørsel_eier_id_fkey (id, navn, visningsnavn),
       arrangement:arrangementer (id, tittel, start_tidspunkt)`,
    )
    .eq('status', 'venter')
    .order('opprettet', { ascending: true })

  const ventende = (data ?? []) as unknown as ForespørselRad[]

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <header style={{ marginTop: 12, marginBottom: 22 }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 32,
            fontWeight: 500,
            letterSpacing: '-0.4px',
            lineHeight: 1.1,
            margin: 0,
            color: 'var(--text-primary)',
          }}
        >
          Pass-godkjenninger
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            color: 'var(--text-secondary)',
            marginTop: 8,
            lineHeight: 1.4,
          }}
        >
          Tur-arrangører ber her om dagstilgang til passinfo for å booke
          reiser. Godkjent forespørsel gir 24 timers tilgang.
        </p>
      </header>

      {error && (
        <div style={{ color: 'var(--danger)', fontSize: 13 }}>
          Kunne ikke hente forespørsler: {error.message}
        </div>
      )}

      {ventende.length === 0 ? (
        <p
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-tertiary)',
            letterSpacing: '0.5px',
          }}
        >
          Ingen ventende forespørsler.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {ventende.map((f, i) => (
            <GodkjenningRad
              key={f.id}
              forespørselId={f.id}
              sokerNavn={f.soker?.visningsnavn ?? f.soker?.navn ?? 'Ukjent'}
              eierNavn={f.eier?.visningsnavn ?? f.eier?.navn ?? 'Ukjent'}
              arrangementTittel={f.arrangement?.tittel ?? 'arrangementet'}
              arrangementStart={f.arrangement?.start_tidspunkt ?? null}
              opprettet={f.opprettet}
              siste={i === ventende.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}
