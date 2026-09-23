import Image from 'next/image'
import Icon from '@/components/ui/Icon'
import { bildeSrc } from '@/lib/bilde-utils'

// Album vist som en bunke fremkalte bilder: hvit papirkant rundt motivet, med
// ett eller to tomme ark stikkende fram bak. Arkene er bevisst TOMME — å vise
// ekte bilde nummer to og tre ville kostet en ekstra spørring per kort, og
// bunken leser like godt med papirkanter alene.

/**
 * Skjevhetene må være FASTE per album, ikke tilfeldige ved hver visning —
 * ellers hopper bunken hver gang siden lastes. Vinklene utledes derfor
 * deterministisk av album-id-en: samme album ligger alltid likt.
 *
 * Enkel streng-hash (samme form som Javas String.hashCode). Vi trenger ingen
 * kryptografisk spredning her, bare at to nabo-id-er ikke får samme vinkel.
 */
function hashTall(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/**
 * Vinkel i grader, deterministisk utledet, i intervallet ±maks.
 * Eksportert kun for test — determinismen er hele poenget og bør pinnes.
 */
export function vinkel(id: string, salt: number, maks: number): number {
  // Saltet skiller de tre vinklene som hentes fra samme id — uten det ville
  // toppen og begge arkene fått nøyaktig samme utslag og bunken sett flat ut.
  const n = hashTall(`${id}:${salt}`) % 1000
  return ((n / 1000) * 2 - 1) * maks
}

/**
 * Hvor mange tomme ark som stikker fram bak toppbildet. Speiler hvor mye som
 * faktisk ligger i albumet, så bunkens tykkelse ikke lyver: et album med to
 * bilder skal ikke se like tjukt ut som ett med førti.
 */
export function antallArk(antall: number): number {
  if (antall >= 3) return 2
  if (antall === 2) return 1
  return 0
}

export default function BildeBunke({
  id,
  src,
  antall,
  sizes,
}: {
  /** Album-id — eneste kilde til skjevheten, se vinkel() over. */
  id: string
  src: string | null
  antall: number
  sizes: string
}) {
  const ark = antallArk(antall)
  const toppVinkel = vinkel(id, 0, 2)
  const bilde = bildeSrc(src)

  return (
    <div style={{ position: 'relative' }}>
      {/* Arkene ligger relativt til BILDET, ikke til hele kortet — ellers
          strekker de seg ned bak tittelen og bunken ser ut som et A4-ark
          med et lite foto oppå. */}
      {Array.from({ length: ark }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'var(--foto-papir)',
            border: '0.5px solid var(--foto-papir-kant)',
            borderRadius: 3,
            boxShadow: 'var(--foto-skygge-ark)',
            // Første ark til venstre, andre til høyre — så bunken vifter ut
            // til begge sider i stedet for å lene seg samme vei.
            //
            // Maks 5° og ±2 px er ikke tilfeldig valgt: et ark som er ~160 px
            // bredt og ~130 px høyt maler da ca. 8 px utenfor sin egen celle,
            // og det er nøyaktig det klaringen i rutenettets gap tåler. Økes
            // tallene her, må gap i album/page.tsx opp tilsvarende.
            transform: `rotate(${vinkel(id, i + 1, 5)}deg) translate(${i === 0 ? -2 : 2}px, ${2 + i}px)`,
          }}
        />
      ))}

      <div
        style={{
          position: 'relative',
          background: 'var(--foto-papir)',
          border: '0.5px solid var(--foto-papir-kant)',
          borderRadius: 3,
          padding: 5,
          boxShadow: 'var(--foto-skygge)',
          transform: `rotate(${toppVinkel}deg)`,
        }}
      >
        <div
          style={{
            position: 'relative',
            // 4:3 er formatet bildene faktisk tas i — kvadratet vi hadde før
            // beskar liggende bilder unødig hardt.
            aspectRatio: '4 / 3',
            overflow: 'hidden',
            // Egen token, ikke --bg-elevated-2: papiret er lyst i BEGGE
            // temaer, og elevated-2 er nær hvit i lyst tema — et tomt album
            // forsvant da helt inn i sin egen papirkant.
            background: 'var(--foto-tom-bg)',
          }}
        >
          {bilde ? (
            <Image src={bilde} alt="" fill sizes={sizes} style={{ objectFit: 'cover' }} />
          ) : (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--foto-tom-ikon)',
              }}
            >
              <Icon name="image" size={26} color="currentColor" strokeWidth={1.25} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
