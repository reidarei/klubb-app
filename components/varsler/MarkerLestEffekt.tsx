'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { markerVarselSomLest } from '@/lib/actions/varsler'

/**
 * Markerer varselet som lest når komponenten mountes. Tomt UI — eneste
 * jobb er å trigge server action + router.refresh(). Lever som klient-
 * komponent fordi Server Components ikke har lov til å kalle
 * revalidatePath under render (Next.js 15+ kaster runtime-feil). Se #261.
 *
 * harTriggret-ref'en hindrer dobbel-kall i React strict mode (dev),
 * der effekter kjøres to ganger ved mount.
 */
export default function MarkerLestEffekt({ varselId }: { varselId: string }) {
  const router = useRouter()
  const harTriggret = useRef(false)

  useEffect(() => {
    if (harTriggret.current) return
    harTriggret.current = true

    markerVarselSomLest(varselId)
      .then(() => {
        // router.refresh() tvinger Router Cache til å hente layout-RSC
        // på nytt så ulest-prikken på avataren forsvinner umiddelbart.
        // revalidatePath på serveren alene rekker ikke frem til klienten
        // før neste navigasjon — se samme mønster i VarslerListe.
        router.refresh()
      })
      .catch(() => {
        // Stille feil — varselet vises korrekt uansett, og brukeren
        // kan trykke "Marker alle som lest" på profil-siden.
      })
  }, [varselId, router])

  return null
}
