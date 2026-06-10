// Klient-side bildeprosessering. Brukes både ved opplasting til R2 og til
// gammel Supabase-storage-flyt (under utfasing). Kjører i nettleseren via
// Canvas API — ingen server-side-prosessering.

// Maks lang side ved hovedbilde-komprimering. 1600px gir god kvalitet på
// store skjermer mens det holder filstørrelsen ned (~200-800 KB JPEG).
const MAKS_LANG_SIDE_PX = 1600

// Tommelnegl-størrelse — brukes i lister og feed der vi ikke trenger full
// oppløsning. Liten nok til å laste raskt på mobildata.
const THUMB_LANG_SIDE_PX = 400

// JPEG-kvalitet ved komprimering. 0.85 er sweet spot for foto — knapt
// merkbart kvalitetstap, betydelig mindre fil enn 0.95.
const JPEG_KVALITET = 0.85

export function genererFilnavn(fil: File): string {
  const ext = fil.name.split('.').pop() || 'jpg'
  return `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
}

// Bildekategorier i R2 — én topp-mappe per type. Holder bucket-en organisert
// og gjør det enkelt å se hva en fil hører til. Legg til ny kategori her
// når en ny upload-sti tas i bruk.
export const BILDE_KATEGORIER = ['arrangementer', 'profiler', 'meldinger', 'chat', 'album'] as const
export type BildeKategori = (typeof BILDE_KATEGORIER)[number]

// Lag en unik path innen kategorien.
export function bildeSti(kategori: BildeKategori, filnavn: string): string {
  return `${kategori}/${filnavn}`
}

// Videokategorier i R2 — egen topp-mappe `video/` slik at video og bilder
// holdes adskilt i bucket-en. Foreløpig kun chat og album; legg til ny
// kategori her når en ny upload-sti tas i bruk.
export const VIDEO_KATEGORIER = ['chat', 'album'] as const
export type VideoKategori = (typeof VIDEO_KATEGORIER)[number]

export function videoSti(kategori: VideoKategori, filnavn: string): string {
  return `video/${kategori}/${filnavn}`
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
