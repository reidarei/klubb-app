import { cache } from 'react'
import { createServerClient } from '@/lib/supabase/server'
import { aktivKlubbId } from '@/lib/klubb-kontekst'

// Bruker getSession() i stedet for getUser() — leser JWT fra cookie uten
// nettverkskall til Supabase. auth-js advarer om at denne verdien ikke er
// autentisk; det er greit HER fordi middleware har verifisert tokenets signatur
// og exp mot prosjektets JWKS før siden i det hele tatt rendres (se
// harGyldigSesjon i middleware.ts).
//
// Premissen er altså ekte, men den er også en avhengighet: fram til vi byttet
// middleware fra getSession() til getClaims() validerte porten ingenting, og
// «trygt fordi middleware validerer» var en påstand uten dekning. Svekkes den
// verifiseringen igjen, må denne fila til getUser() i samme håndgrep.
export const getInnloggetBruker = cache(async () => {
  const supabase = await createServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ?? null
})

export const getProfil = cache(async () => {
  const supabase = await createServerClient()
  const user = await getInnloggetBruker()
  if (!user) return null
  // Rolle fra medlemskap i aktiv klubb, profilfeltene via embed (#868). FK-hintet
  // er påkrevd fra PR B (to veier mellom tabellene gir ellers PGRST201).
  const { data, error } = await supabase
    .from('medlemskap')
    .select('rolle, profiles!medlemskap_profil_id_fkey(navn, bilde_url, chat_sist_sett)')
    .eq('klubb_id', aktivKlubbId())
    .eq('profil_id', user.id)
    .eq('aktiv', true)
    .maybeSingle()
  // Fail closed (autorisasjon): brukes til rolle-sjekker i hele appen
  // (kanAdministrere osv.) — en svelget feil her ville stille latt en
  // feilende spørring se ut som «ingen rolle», ikke som en feil.
  if (error) throw new Error(`Kunne ikke hente profil: ${error.message}`)
  // null = degradert header, IKKE /login (ellers evig omdirigering, jf. middleware.ts).
  if (!data || !data.profiles) return null
  return {
    rolle: data.rolle,
    navn: data.profiles.navn,
    bilde_url: data.profiles.bilde_url,
    chat_sist_sett: data.profiles.chat_sist_sett,
  }
})
