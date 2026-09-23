// Hvem «Ping en herre»-lista skal vise (#725).
//
// Ren funksjon — spørringene (aktive profiler, påmeldinger) gjøres i
// app/(app)/kart/page.tsx, denne filen regner kun ut RESULTATET, slik at
// utvelgelsen kan enhetstestes uten et Supabase-oppsett.

export type PingKandidat = {
  profilId: string
  navn: string
  bildeUrl: string | null
  rolle: string | null
}

export type AktivProfilRad = {
  id: string
  navn: string
  visningsnavn?: string | null
  bilde_url: string | null
  rolle: string | null
}

export type PaameldingRad = {
  profil_id: string
  status: string
}

/**
 * Pågår det et arrangement, er kandidatene de PÅMELDTE (status 'ja') til
 * NETTOPP det arrangementet — bruk finnPaagaaendeArrangement(), IKKE
 * finnAktuellArrangement(), ellers ville en tur langt fram i tid (som ikke
 * har startet) gitt julebord-påmeldte som pling-liste midt i september.
 *
 * Ingen pågående arrangement: alle aktive medlemmer er kandidater — det
 * finnes ingen påmeldingsliste å avgrense mot.
 *
 * Begge grener trekker fra dem som ALLEREDE deler posisjon (`delerAlleredeIder`)
 * — de står jo allerede synlige på kartet, «Ping en herre» er for dem som
 * IKKE gjør det.
 */
export function beregnPingKandidater(
  alleAktive: AktivProfilRad[],
  paameldinger: PaameldingRad[],
  paagaaendeArrangementId: string | null,
  delerAlleredeIder: Set<string>,
): PingKandidat[] {
  const paameldtIder = new Set(
    paameldinger.filter(p => p.status === 'ja').map(p => p.profil_id),
  )

  const grunnlag = paagaaendeArrangementId
    ? alleAktive.filter(p => paameldtIder.has(p.id))
    : alleAktive

  return grunnlag
    .filter(p => !delerAlleredeIder.has(p.id))
    .map(p => ({
      profilId: p.id,
      navn: p.visningsnavn || p.navn || 'Ukjent',
      bildeUrl: p.bilde_url,
      rolle: p.rolle,
    }))
}
