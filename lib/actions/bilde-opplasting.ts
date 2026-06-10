'use server'

import { ensureInnlogget } from '@/lib/auth'
import { lastOppR2, slettR2, r2StiFraUrl } from '@/lib/r2'
import { bildeSti, BILDE_KATEGORIER, type BildeKategori } from '@/lib/bilde-utils'

// Maksstørrelse mot R2 — komprimering på klienten skal holde filer godt
// under dette, men vi avviser eksplisitt for å unngå at store råfiler
// slipper gjennom hvis komprimering hoppes over.
const MAKS_BYTES = 5 * 1024 * 1024

// Tillatte MIME-typer. Klient-komprimering produserer alltid JPEG, men vi
// godtar et lite spillerom for å støtte rå-opplasting (f.eks. ny upload-
// flyt som ikke komprimerer enda).
const TILLATTE_TYPER = ['image/jpeg', 'image/png', 'image/webp']

function erKategori(v: unknown): v is BildeKategori {
  return typeof v === 'string' && (BILDE_KATEGORIER as readonly string[]).includes(v)
}

// Last opp et bilde til R2 i gitt kategori. Returnerer public URL.
// FormData skal inneholde `fil`, `filnavn` og `kategori`. Filnavn genereres
// på klienten via genererFilnavn() — server validerer kun at det finnes.
export async function lastOppBilde(formData: FormData): Promise<{ url: string }> {
  try {
    await ensureInnlogget()

    const fil = formData.get('fil')
    const filnavn = formData.get('filnavn')
    const kategori = formData.get('kategori')

    if (!(fil instanceof File)) throw new Error('Mangler fil')
    if (typeof filnavn !== 'string' || !filnavn.trim()) throw new Error('Mangler filnavn')
    if (!erKategori(kategori)) throw new Error('Ugyldig kategori')
    if (fil.size > MAKS_BYTES) throw new Error(`Filen er for stor (maks ${MAKS_BYTES / 1024 / 1024} MB)`)
    if (!TILLATTE_TYPER.includes(fil.type)) throw new Error('Ugyldig filtype')

    const data = new Uint8Array(await fil.arrayBuffer())
    const sti = bildeSti(kategori, filnavn)
    const url = await lastOppR2(sti, data, fil.type)

    return { url }
  } catch (err) {
    // Log fullt til server-konsoll, og kast en ren Error som klienten kan
    // vise i UI. Default Next-wrapper ("server components render error")
    // skjuler ellers den faktiske årsaken.
    console.error('[bilde-opplasting] feil:', err)
    const melding = err instanceof Error ? err.message : 'Ukjent feil ved opplasting'
    throw new Error(`Opplasting feilet: ${melding}`)
  }
}

// Slett et R2-bilde basert på public URL.
// Idempotent — feiler ikke hvis URL-en ikke peker til vår R2 eller filen
// allerede er borte. Eldre Supabase-URL-er passerer uberørt.
export async function slettBilde(url: string | null): Promise<void> {
  if (!url) return
  await ensureInnlogget()
  const sti = r2StiFraUrl(url)
  if (!sti) return // ikke en R2-URL, hopp over
  await slettR2(sti)
}
