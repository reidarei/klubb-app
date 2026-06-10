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
  const { data } = await supabase
    .from('profiles')
    .select('rolle, navn, bilde_url, chat_sist_sett')
    .eq('id', user.id)
    .single()
  return data
})
