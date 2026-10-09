// Bilde-hjelpere delt mellom klient og server.
//   - Klient: komprimer()/lagThumbnail() skalerer via Canvas.
//   - Server: nyttR2Filnavn/bildeSti/videoSti/albumSti lager og saniterer
//     R2-nøkler. Kalles KUN fra server actions, så klient-filnavn aldri styrer nøkkelen.
// Se CLAUDE.md § Policy: Bildelagring og § Policy: Bildevisning.

// 1600 px gir god kvalitet og holder filen på ~200–800 KB JPEG.
const MAKS_LANG_SIDE_PX = 1600

const THUMB_LANG_SIDE_PX = 400

// 0.85: knapt merkbart tap, betydelig mindre fil enn 0.95.
const JPEG_KVALITET = 0.85

// Endelse utledes fra validert MIME, aldri fra klientens filnavn.
export const EXT_FRA_BILDE_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

// quicktime (.mov) er iPhones default.
export const EXT_FRA_VIDEO_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
}

// Unikhet, ikke hemmelighet. Global Web Crypto, ikke `node:crypto`: modulen
// bundles også på klienten. randomUUID gir alltid ikke-tomt suffiks, i
// motsetning til Math.random().toString(36).slice(2).
export function nyttR2Filnavn(ext: string): string {
  const suffiks = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  return `${Date.now()}-${suffiks}.${ext}`
}

// Blokkerer path-traversal (../), skjulte filer og mappekomponenter.
const GYLDIG_FILNAVN = /^[A-Za-z0-9._-]+$/

function validerFilnavn(filnavn: string): void {
  if (
    filnavn.includes('/') ||
    filnavn.includes('\\') ||
    filnavn.includes('..') ||
    filnavn.startsWith('.') ||
    !GYLDIG_FILNAVN.test(filnavn)
  ) {
    throw new Error(`Ugyldig filnavn: ${filnavn}`)
  }
}

// Generisk UUID-form for albumId fra FormData. Versjonsbits håndheves bevisst
// ikke — ankret hex-form er nok mot traversal og injeksjon.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Én topp-mappe per type i R2. Ny upload-sti → ny kategori her.
export const BILDE_KATEGORIER = ['arrangementer', 'profiler', 'meldinger', 'chat', 'album', 'bursdagsbilder'] as const
export type BildeKategori = (typeof BILDE_KATEGORIER)[number]

// Validerer filnavnet uansett om kalleren brukte nyttR2Filnavn (defense-in-depth).
export function bildeSti(kategori: BildeKategori, filnavn: string): string {
  validerFilnavn(filnavn)
  return `${kategori}/${filnavn}`
}

// Video under egen topp-mappe `video/`. Ny upload-sti → ny kategori her.
export const VIDEO_KATEGORIER = ['chat', 'album'] as const
export type VideoKategori = (typeof VIDEO_KATEGORIER)[number]

export function videoSti(kategori: VideoKategori, filnavn: string): string {
  validerFilnavn(filnavn)
  return `video/${kategori}/${filnavn}`
}

// album/{albumId}/{filnavn}. Begge deler kan komme fra klienten og valideres.
export function albumSti(albumId: string, filnavn: string): string {
  if (!UUID_REGEX.test(albumId)) {
    throw new Error(`Ugyldig albumId: ${albumId}`)
  }
  validerFilnavn(filnavn)
  return `album/${albumId}/${filnavn}`
}

// Eneste trakt for lagrede bilde-/video-URL-er inn i src (#609). Identitet i
// dag; skal forbli ren og synkron (aldri async, aldri importere lib/r2.ts).
// null betyr INGEN URL, ikke «nektet tilgang» — se CLAUDE.md § Policy: Bildevisning.
export function bildeSrc(url: string | null | undefined): string | null {
  if (!url) return null
  return url
}

// Skalerer til maks `maks` på lang side og eksporterer JPEG.
function skalerOgEksporter(
  fil: File,
  maks: number,
  kvalitet: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(fil)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maks || height > maks) {
        if (width > height) {
          height = Math.round((height * maks) / width)
          width = maks
        } else {
          width = Math.round((width * maks) / height)
          height = maks
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('Kunne ikke generere blob'))),
        'image/jpeg',
        kvalitet,
      )
    }
    img.onerror = () => reject(new Error('Kunne ikke lese bildet'))
    img.src = url
  })
}

export async function komprimer(fil: File): Promise<File> {
  const blob = await skalerOgEksporter(fil, MAKS_LANG_SIDE_PX, JPEG_KVALITET)
  return new File([blob], fil.name.replace(/\.[^.]+$/, '.jpg'), {
    type: 'image/jpeg',
  })
}

// `-thumb`-suffiks så den kan lastes opp som egen R2-nøkkel ved siden av hovedbildet.
export async function lagThumbnail(fil: File): Promise<File> {
  const blob = await skalerOgEksporter(fil, THUMB_LANG_SIDE_PX, JPEG_KVALITET)
  const basis = fil.name.replace(/\.[^.]+$/, '')
  return new File([blob], `${basis}-thumb.jpg`, { type: 'image/jpeg' })
}
