// Ren, synkron gest-matematikk for pinch-zoom + panorering i fullskjerm-
// bildevisning (AlbumLightbox, #625). Ingen React-import — en pinch-gest kan
// ikke automatiseres i Playwright, så matematikken samles her og dekkes av
// vitest i stedet for e2e (__tests__/bilde-zoom.test.ts).
//
// Merk: matematikken er bare halve historien. Selve gest-maskinen (hvilke
// pekere er nede, når er en gest et sveip/pinch/trykk, er wheel-lytteren i det
// hele tatt registrert) testes som komponent i jsdom —
// __tests__/album-lightbox-gest.test.tsx. Begge de alvorlige feilene i første
// runde av #625 lå i maskinen, ikke i formlene her.
//
// Grensene bor her og ikke i lib/konstanter.ts: den fila er for
// domenekonstanter (tegnegrenser, dag-vinduer), mens dette er gest-parametere
// som kun gir mening sammen med resten av denne modulen.

export const MIN_SKALA = 1
export const MAKS_SKALA = 4

// Terskel (px) for horisontal sveip som bytter bilde. Flyttet hit fra den
// tidligere inline `const TERSKEL = 50` i AlbumLightbox slik at den kan
// enhetstestes sammen med resten av gest-logikken.
export const SVEIP_TERSKEL = 50

// Bevegelsesterskel (px) for å skille «trykk» (lukker lightboxen når
// lukkVedTrykk er satt) fra «dra».
export const TRYKK_TERSKEL = 10

// Hvor nærme 1 skalaen må være før vi snapper tilbake til nøyaktig
// MIN_SKALA. Uten denne kunne en pinch som slipper på f.eks. 1.003 latt
// panorering stå på, selv om brukeren opplevde å ha gått tilbake til start.
export const SNAP_TOLERANSE = 0.02

export type Punkt = { x: number; y: number }

// Samme mønster som BildeCropper.tsx: avstand mellom to pekere for pinch.
export function avstand(a: Punkt, b: Punkt): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

// Midtpunktet mellom to pekere — pinchens fokuspunkt på skjermen.
export function midtpunkt(a: Punkt, b: Punkt): Punkt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

// Absolutt (ikke inkrementell) ny skala ut fra forholdet mellom nåværende og
// startens pinch-avstand, klemt til [MIN_SKALA, MAKS_SKALA].
export function nySkala(startDist: number, naaDist: number, startSkala: number): number {
  if (startDist <= 0) return Math.max(MIN_SKALA, Math.min(MAKS_SKALA, startSkala))
  const skala = startSkala * (naaDist / startDist)
  return Math.max(MIN_SKALA, Math.min(MAKS_SKALA, skala))
}

// Holder punktet under fingrene i ro når skalaen endres. Uten denne ville
// bildet zoome om sitt eget sentrum, som føles feil på en telefon der man
// kniper med to fingre et sted som ikke er midten av skjermen.
export function fokusJustering(pos: number, fokus: number, gammelSkala: number, ny: number): number {
  return fokus - (fokus - pos) * (ny / gammelSkala)
}

// Klemmer posisjonen slik at det zoomede bildet aldri slipper viewportens
// kant og etterlater tomrom — samme formel som BildeCropper.tsx (maxX/maxY
// = halvparten av differansen mellom skalert bildestørrelse og viewet).
// Ved skala 1 er bildeB*1 - viewB alltid <= 0 (bildet er aldri større enn
// viewet der), så maxX/maxY blir 0 og posisjonen klemmes alltid til {0, 0}.
export function klemPosisjon(
  pos: Punkt,
  skala: number,
  bildeBredde: number,
  bildeHoyde: number,
  viewBredde: number,
  viewHoyde: number,
): Punkt {
  const maxX = Math.max(0, (bildeBredde * skala - viewBredde) / 2)
  const maxY = Math.max(0, (bildeHoyde * skala - viewHoyde) / 2)
  return {
    x: Math.max(-maxX, Math.min(maxX, pos.x)),
    y: Math.max(-maxY, Math.min(maxY, pos.y)),
  }
}

// Zoom skal aldri stjele sveipet (#625): så snart brukeren har zoomet inn
// (skala > MIN_SKALA) skal en horisontal drag panorere, ikke bytte bilde.
export function sveipUtfall(deltaX: number, skala: number): 'neste' | 'forrige' | 'ingen' {
  if (skala > MIN_SKALA) return 'ingen'
  if (Math.abs(deltaX) > SVEIP_TERSKEL) {
    return deltaX < 0 ? 'neste' : 'forrige'
  }
  return 'ingen'
}

// Snapper skalaen til nøyaktig MIN_SKALA når den er tilstrekkelig nær 1 —
// hindrer at en pinch som slipper på f.eks. 0.995 låser panorering/sveip-
// sperren på selv om brukeren opplevde å være tilbake ved start.
export function snapp(skala: number): number {
  return Math.abs(skala - MIN_SKALA) < SNAP_TOLERANSE ? MIN_SKALA : skala
}
