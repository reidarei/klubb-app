// Bilde-hjelpere delt mellom klient og server.
//   - Klient-side: komprimer()/lagThumbnail() skalerer via Canvas API i
//     nettleseren (ingen server-side bildeprosessering).
//   - Server-side: nyttR2Filnavn/bildeSti/videoSti/albumSti genererer og
//     saniterer R2-objektnøkler. Disse kalles KUN fra server actions
//     (lib/actions/*) — ikke fra klient — så klient-filnavn aldri styrer nøkkelen.

// Maks lang side ved hovedbilde-komprimering. 1600px gir god kvalitet på
// store skjermer mens det holder filstørrelsen ned (~200-800 KB JPEG).
const MAKS_LANG_SIDE_PX = 1600

// Tommelnegl-størrelse — brukes i lister og feed der vi ikke trenger full
// oppløsning. Liten nok til å laste raskt på mobildata.
const THUMB_LANG_SIDE_PX = 400

// JPEG-kvalitet ved komprimering. 0.85 er sweet spot for foto — knapt
// merkbart kvalitetstap, betydelig mindre fil enn 0.95.
const JPEG_KVALITET = 0.85

// MIME-type til fil-endelse for bilder. Brukes på server-siden for å
// utlede endelse fra validert MIME — aldri fra klient-oppgitt filnavn.
export const EXT_FRA_BILDE_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

// MIME-type til fil-endelse for video. mp4 er standard; quicktime (.mov)
// er det iPhones produserer som default.
export const EXT_FRA_VIDEO_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
}

// Generer et unikt filnavn på serveren basert på validert mime-ext.
// Date.now() + tilfeldig suffix gir praktisk unikhet — ikke en hemmelighet,
// bare en kollisjons-buffer. Kalles kun server-side, aldri fra klient.
//
// Suffikset bruker Web Crypto (global `crypto`, ingen import) fremfor
// Math.random().toString(36).slice(2): sistnevnte kan i teorien gi tom streng
// (Math.random()===0 → '0'.slice(2)===''), noe Copilot flagget som flaky-test-
// risiko. crypto.randomUUID() returnerer alltid en velformet UUID, så
// suffikset er garantert ikke-tomt og har høyere entropi. Vi bruker den globale
// Web Crypto-varianten — ikke `node:crypto` — fordi denne modulen også
// bundles på klienten (komprimer/lagThumbnail), og et `node:`-import ville
// brutt klient-bygget. crypto.randomUUID() finnes i både browser og Node 20+.
export function nyttR2Filnavn(ext: string): string {
  const suffiks = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  return `${Date.now()}-${suffiks}.${ext}`
}

// Whitelist for gyldige filnavn-tegn. Blokkerer path-traversal (../),
// skjulte filer (.secret) og mappekomponenter (/).
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

// Generisk UUID-form (8-4-4-4-12 hex) — brukes til å validere albumId
// server-side. albumId kommer fra FormData og kan ikke stoles på. Vi
// håndhever bevisst ikke v4/variant-bits (ankringen ^...$ + hex-form er nok
// til å blokkere path-traversal og injeksjon). `i`-flagget gjør den case-
// insensitiv så uppercase-UUID-er også godtas, selv om vår egen
// gen_random_uuid() alltid gir lowercase.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Bildekategorier i R2 — én topp-mappe per type. Holder bucket-en organisert
// og gjør det enkelt å se hva en fil hører til. Legg til ny kategori her
// når en ny upload-sti tas i bruk.
export const BILDE_KATEGORIER = ['arrangementer', 'profiler', 'meldinger', 'chat', 'album'] as const
export type BildeKategori = (typeof BILDE_KATEGORIER)[number]

// Lag en unik path innen kategorien. Kaster hvis filnavn inneholder
// path-traversal eller ulovlige tegn (defense-in-depth — uavhengig av
// om kalleren allerede bruker nyttR2Filnavn).
export function bildeSti(kategori: BildeKategori, filnavn: string): string {
  validerFilnavn(filnavn)
  return `${kategori}/${filnavn}`
}

// Videokategorier i R2 — egen topp-mappe `video/` slik at video og bilder
// holdes adskilt i bucket-en. Foreløpig kun chat og album; legg til ny
// kategori her når en ny upload-sti tas i bruk.
export const VIDEO_KATEGORIER = ['chat', 'album'] as const
export type VideoKategori = (typeof VIDEO_KATEGORIER)[number]

// Lag en unik path for video innen kategorien. Kaster ved ulovlig filnavn.
export function videoSti(kategori: VideoKategori, filnavn: string): string {
  validerFilnavn(filnavn)
  return `video/${kategori}/${filnavn}`
}

// Lag en unik path for et album-bilde. Validerer albumId mot UUID-regex og
// filnavn mot whitelist — begge kan komme fra klient/FormData og kan ikke
// stoles på. R2-sti: album/{albumId}/{filnavn}
export function albumSti(albumId: string, filnavn: string): string {
  if (!UUID_REGEX.test(albumId)) {
    throw new Error(`Ugyldig albumId: ${albumId}`)
  }
  validerFilnavn(filnavn)
  return `album/${albumId}/${filnavn}`
}

// Felles helper: skalerer et bilde til maks `maks` på lang side, returnerer
// JPEG-Blob med gitt kvalitet. Bruk i komprimer() og lagThumbnail().
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

// Lag en thumbnail (400px lang side) av samme fil. Returneres som File
// med `-thumb`-suffix på navnet slik at den kan lastes opp som egen R2-
// nøkkel parallelt med hovedbildet.
export async function lagThumbnail(fil: File): Promise<File> {
  const blob = await skalerOgEksporter(fil, THUMB_LANG_SIDE_PX, JPEG_KVALITET)
  const basis = fil.name.replace(/\.[^.]+$/, '')
  return new File([blob], `${basis}-thumb.jpg`, { type: 'image/jpeg' })
}
