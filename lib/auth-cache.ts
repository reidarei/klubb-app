import { cache } from 'react'
import { createServerClient } from '@/lib/supabase/server'

// Bruker getSession() i stedet for getUser() — leser JWT fra cookie
// uten nettverkskall til Supabase. Trygt fordi middleware allerede validerer.
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
