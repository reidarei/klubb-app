'use server'

// Admin-flatens «Generer»-knapp (#641) — tvunget generering/regenerering av
// ett medlems bursdagsbilde. Selve genereringslogikken bor i
// lib/bursdagsbilde-generering.ts og deles med cron-ruta; denne funksjonen er
// bare admin-inngangen: den slår opp fersk profildata server-side (aldri
// klient-oppgitt navn/bilde/stikkord) og kaller genererBursdagsbilde() med
// tvungen = true.

import { ensureAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { genererBursdagsbilde, type BursdagsbildeUtfall } from '@/lib/bursdagsbilde-generering'
import { alderIAar } from '@/lib/bursdag'
import { BURSDAGSBILDE_PAA } from '@/lib/config'
import { revalidatePath } from 'next/cache'

// Admin-flatens utfall = genereringens utfall + 'av'. Egen variant fremfor
// et kast: Next maskerer feilmeldinger fra server actions i prod-bygg, så
// en throw ville gitt admin en digest-hash i stedet for grunnen. Varianten
// bor her og ikke i BursdagsbildeUtfall fordi genererBursdagsbilde() aldri
// kan returnere den — cron-ruta har sin egen guard mot samme flagg.
export type AdminGenereringUtfall = BursdagsbildeUtfall | { utfall: 'av' }

export async function genererBursdagsbildeNaa(
  profilId: string,
  feiringsdato: string,
): Promise<AdminGenereringUtfall> {
  await ensureAdmin()

  // Samme guard som cron-ruta (app/api/cron/bursdagsbilde/route.ts): uten
  // Vertex-credentials kan ingenting genereres, og uten denne sjekken ville
  // knappen ha claimet raden og skrevet en 'feilet'-rad med en uforståelig
  // transport-feil (base64/JSON-parse) for en instans som umulig kan lykkes.
  // Sjekken står ETTER ensureAdmin() — autorisasjon før alt annet.
  if (!BURSDAGSBILDE_PAA) return { utfall: 'av' }

  const admin = createAdminClient()

  const { data: profil, error: profilFeil } = await admin
    .from('profiles')
    .select('id, navn, visningsnavn, bilde_url, fodselsdato, stikkord')
    .eq('id', profilId)
    .maybeSingle()
  if (profilFeil) throw new Error(`Kunne ikke hente profil: ${profilFeil.message}`)
  if (!profil) throw new Error('Fant ikke medlemmet')
  if (!profil.bilde_url) throw new Error('Medlemmet mangler profilbilde')
  if (!profil.fodselsdato) throw new Error('Medlemmet mangler fødselsdato')

  const resultat = await genererBursdagsbilde(admin, {
    profil: {
      id: profil.id,
      navn: profil.visningsnavn ?? profil.navn ?? 'Ukjent',
      bildeUrl: profil.bilde_url,
      alder: alderIAar(profil.fodselsdato, feiringsdato),
      stikkord: profil.stikkord ?? '',
    },
    feiringsdato,
    tvungen: true,
  })

  // /innstillinger/bursdagsbilde for admin-oversikten selv, / for agenda-
  // kortet (mannen kan ha bursdag i dag når admin trykker Generer manuelt).
  revalidatePath('/innstillinger/bursdagsbilde')
  revalidatePath('/')
  return resultat
}
