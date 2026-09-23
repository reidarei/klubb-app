'use server'

import { ensureInnlogget } from '@/lib/auth'
import { lastOppR2, slettR2, r2StiFraUrl } from '@/lib/r2'
import { videoSti, VIDEO_KATEGORIER, type VideoKategori, EXT_FRA_VIDEO_MIME, nyttR2Filnavn } from '@/lib/bilde-utils'
import { logg } from '@/lib/logg'

// Maksstørrelse for video. 50 MB er en pragmatisk grense som rommer korte
// mobilopptak; vi avviser større filer eksplisitt for å unngå at urimelig
// store råfiler slipper gjennom.
const MAKS_BYTES = 50 * 1024 * 1024

// Tillatte MIME-typer for video. mp4 er standard; quicktime er det iPhones
// produserer som default. Endelsen utledes server-side fra MIME — aldri fra
// klient-oppgitt filnavn.
const TILLATTE_MIME = Object.keys(EXT_FRA_VIDEO_MIME)

function erKategori(v: unknown): v is VideoKategori {
  return typeof v === 'string' && (VIDEO_KATEGORIER as readonly string[]).includes(v)
}

// Last opp en video til R2 i gitt kategori. Returnerer public URL.
// FormData skal inneholde `fil` og `kategori`. Filnavnet genereres
// server-side fra validert MIME-type — klient-oppgitt filnavn brukes ikke.
export async function lastOppVideo(formData: FormData): Promise<{ url: string }> {
  try {
    await ensureInnlogget()

    const fil = formData.get('fil')
    const kategori = formData.get('kategori')

    if (!(fil instanceof File)) throw new Error('Mangler fil')
    if (!erKategori(kategori)) throw new Error('Ugyldig kategori')
    if (fil.size > MAKS_BYTES) throw new Error(`Filen er for stor (maks ${MAKS_BYTES / 1024 / 1024} MB)`)
    if (!TILLATTE_MIME.includes(fil.type)) throw new Error('Ugyldig filtype')

    // Filnavn utledes fra validert MIME — aldri fra klient-oppgitt verdi.
    const ext = EXT_FRA_VIDEO_MIME[fil.type]
    const filnavn = nyttR2Filnavn(ext)

    // Send Blob direkte til R2 — sparer en ekstra kopi i minnet (50 MB ×).
    // lastOppR2 leser size fra Blob og setter Content-Length korrekt.
    const sti = videoSti(kategori, filnavn)
    const url = await lastOppR2(sti, fil, fil.type)

    return { url }
  } catch (err) {
    await logg.feil('video.opplast.feilet', err)
    const melding = err instanceof Error ? err.message : 'Ukjent feil ved opplasting'
    throw new Error(`Opplasting feilet: ${melding}`)
  }
}

// Slett en R2-video basert på public URL.
// Idempotent — feiler ikke hvis URL-en ikke peker til vår R2 eller filen
// allerede er borte. Eldre Supabase-URL-er passerer uberørt.
export async function slettVideo(url: string | null): Promise<void> {
  if (!url) return
  await ensureInnlogget()
  const sti = r2StiFraUrl(url)
  if (!sti) return // ikke en R2-URL, hopp over
  await slettR2(sti)
}
