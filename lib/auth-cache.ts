import { cache } from 'react'
import { createServerClient } from '@/lib/supabase/server'

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
  const { data, error } = await supabase
    .from('profiles')
    .select('rolle, navn, bilde_url, chat_sist_sett')
    .eq('id', user.id)
    .maybeSingle()
  // Fail closed (autorisasjon): brukes til rolle-sjekker i hele appen
  // (kanAdministrere osv.) — en svelget feil her ville stille latt en
  // feilende spørring se ut som «ingen rolle», ikke som en feil.
  if (error) throw new Error(`Kunne ikke hente profil: ${error.message}`)
  return data
})
