'use server'

import { ensureInnlogget } from '@/lib/auth'
import { lastOppR2, slettR2, r2StiFraUrl } from '@/lib/r2'
import { videoSti, VIDEO_KATEGORIER, type VideoKategori } from '@/lib/bilde-utils'

// Maksstørrelse for video. 50 MB er en pragmatisk grense som rommer korte
// mobilopptak; vi avviser større filer eksplisitt for å unngå at urimelig
// store råfiler slipper gjennom.
const MAKS_BYTES = 50 * 1024 * 1024

// Tillatte (MIME, ekstensjon)-par. Vi krysssjekker for å hindre at en
// klient sender f.eks. .mov-ekstensjon med video/mp4-MIME (eller motsatt).
// mp4 er standard; quicktime (.mov) er det iPhones produserer som default.
const TILLATTE_PAR: ReadonlyArray<{ mime: string; ext: string }> = [
  { mime: 'video/mp4', ext: 'mp4' },
  { mime: 'video/quicktime', ext: 'mov' },
]

function erKategori(v: unknown): v is VideoKategori {
  return typeof v === 'string' && (VIDEO_KATEGORIER as readonly string[]).includes(v)
}

function ekstensjon(filnavn: string): string {
  const idx = filnavn.lastIndexOf('.')
  if (idx < 0) return ''
  return filnavn.slice(idx + 1).toLowerCase()
}

// Last opp en video til R2 i gitt kategori. Returnerer public URL.
// FormData skal inneholde `fil`, `filnavn` og `kategori`. Filnavn genereres
// på klienten — server validerer kun at det finnes og har lovlig endelse.
export async function lastOppVideo(formData: FormData): Promise<{ url: string }> {
  try {
    await ensureInnlogget()

    const fil = formData.get('fil')
    const filnavn = formData.get('filnavn')
    const kategori = formData.get('kategori')

    if (!(fil instanceof File)) throw new Error('Mangler fil')
    if (typeof filnavn !== 'string' || !filnavn.trim()) throw new Error('Mangler filnavn')
    if (!erKategori(kategori)) throw new Error('Ugyldig kategori')
    if (fil.size > MAKS_BYTES) throw new Error(`Filen er for stor (maks ${MAKS_BYTES / 1024 / 1024} MB)`)
    const ext = ekstensjon(filnavn)
    if (!TILLATTE_PAR.some((p) => p.mime === fil.type && p.ext === ext)) {
      throw new Error('Ugyldig filtype eller filendelse')
    }

    // Send Blob direkte til R2 — sparer en ekstra kopi i minnet (50 MB ×).
    // lastOppR2 leser size fra Blob og setter Content-Length korrekt.
    const sti = videoSti(kategori, filnavn)
    const url = await lastOppR2(sti, fil, fil.type)

    return { url }
  } catch (err) {
    console.error('[video-opplasting] feil:', err)
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
