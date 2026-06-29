'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@/lib/supabase/server'
import { getProfil, getInnloggetBruker } from '@/lib/auth-cache'
import { revalidatePath } from 'next/cache'
import { kanAdministrere, rollerMed } from '@/lib/roller'
import { naa } from '@/lib/dato'

export async function oppdaterVarselInnstilling(noekkel: string, aktiv: boolean) {
  const profil = await getProfil()
  if (!kanAdministrere(profil?.rolle)) return

  const admin = createAdminClient()
  await admin
    .from('varsel_innstillinger')
    .update({ aktiv, oppdatert: naa() })
    .eq('noekkel', noekkel)

  revalidatePath('/innstillinger')
}

export async function oppdaterTestEpost(epost: string) {
  const profil = await getProfil()
  if (!kanAdministrere(profil?.rolle)) return

  const admin = createAdminClient()
  // Kun aktive admin-profiler er gyldige test-mottakere — testmodus skal
  // aldri kunne rute varsler til et vanlig medlem ved en feiltastet epost.
  const { data: mottaker } = await admin
    .from('profiles')
    .select('id')
    .eq('epost', epost)
    .eq('aktiv', true)
    .in('rolle', rollerMed('kanAdministrere'))
    .maybeSingle()
  if (!mottaker) return

  await admin
    .from('varsel_innstillinger')
    .update({ beskrivelse: epost, oppdatert: naa() })
    .eq('noekkel', 'test_modus')

  revalidatePath('/innstillinger')
}

// Oppdaterer per-admin toggle for automatisk bursdagsgratulasjon.
// Skrives til profiles-tabellen med innlogget brukers RLS-kontekst —
// ingen kan skru på/av for andre.
export async function oppdaterBursdagsgratulasjon(aktiv: boolean) {
  const [profil, bruker] = await Promise.all([getProfil(), getInnloggetBruker()])
  if (!kanAdministrere(profil?.rolle) || !bruker) return

  const supabase = await createServerClient()
  // bursdagsgratulasjon_aktiv finnes etter migrasjon 100; payload castes til any
  // til TypeScript er regenerert mot ny databasestruktur. Castet smalt rundt
  // selve payload-objektet slik at resten av query-kjeden beholder typene.
  await supabase
    .from('profiles')
    .update({ bursdagsgratulasjon_aktiv: aktiv } as any)
    .eq('id', bruker.id)

  revalidatePath('/innstillinger')
}
