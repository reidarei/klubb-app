import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProfil } from '@/lib/auth-cache'
import { kanAdministrere } from '@/lib/roller'
import UndersideHode from '@/components/innstillinger/UndersideHode'
import VarselLogg from '../VarselLogg'

export default async function Varselhistorikk() {
  const profil = await getProfil()
  if (!kanAdministrere(profil?.rolle)) notFound()

  const { data: logg, count, error } = await createAdminClient()
    // teller_ulest = true filtrerer bort chat-broadcastene (#612) — ellers er
    // lista ren chat innen minutter. Samme filter må stå i
    // /api/admin/varsel-logg (paginering), ellers henter «Vis flere» chat inn igjen.
    .from('varsel_logg')
    .select('id, tittel, type, kanal, opprettet, profil_id, profiles (visningsnavn)', { count: 'exact' })
    .eq('teller_ulest', true)
    .order('opprettet', { ascending: false })
    .limit(10)
  if (error) throw new Error(`Kunne ikke hente varsel_logg: ${error.message}`)

  return (
    <div style={{ padding: '0 20px 20px' }}>
      <UndersideHode
        tittel="Varselhistorikk"
        ingress="Varsler appen har sendt, nyeste først. Chatmeldinger er ikke med."
      />
      <VarselLogg initial={logg ?? []} total={count ?? 0} />
    </div>
  )
}
