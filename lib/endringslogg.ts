// Bygger radene til «Hva er nytt»-visningen på /om-appen (#595) ut fra en
// statisk, håndskrevet liste over merkbare endringer (lib/endringslogg-data.ts).
//
// «Mindre feilrettinger og tekniske endringer»-rader UTLEDES her fremfor å
// lagres, fordi patch-tallet øker ved HVERT bygg (npm run stamp-versjon),
// ikke per release — de aller fleste versjoner har ingen medlemsvendt
// endring. Uten utledningen ville nummerrekken hatt hull som ser ut som noe
// mangler. En «mindre»-rad slår sammen alle upåaktede versjoner i ett spenn.
//
// Delt kode (MÅ MATCHE) — ingen klubbdata her, kun det generiske algoritme-
// laget. Selve innholdet bor i lib/endringslogg-data.ts (DIVERGERER).
//
// OBS: et major.minor-bump (ny «serie», jf. scripts/stamp-versjon.mjs som
// nullstiller patch-telleren per serie) kan etterlate et hull øverst i
// FORRIGE serie hvis ingen skrev en oppføring for siste versjon der før
// bumpen. byggEndringslogg() fyller kun gapet mellom gjeldende versjon og
// nyeste oppføring — et allerede uskrevet hull på toppen av en forlatt serie
// blir aldri gjenoppdaget i etterkant.

export type Endring = {
  versjon: string
  dato: string
  tekst: string
}

export type LoggRad = {
  // Ingen egen `id`: `visning` er unik per rad (radene er strengt synkende,
  // ikke-overlappende patch-spenn) og brukes direkte som React-key.
  visning: string
  dato?: string
  tekst: string
  mindre: boolean
}

export const MINDRE_TEKST = 'Mindre feilrettinger og tekniske endringer'

const VERSJON_REGEX = /^V(\d+)\.(\d+)\.(\d+)$/

type ParsetVersjon = { major: number; minor: number; patch: number }

function parseVersjon(versjon: string): ParsetVersjon | null {
  const treff = VERSJON_REGEX.exec(versjon)
  if (!treff) return null
  return { major: Number(treff[1]), minor: Number(treff[2]), patch: Number(treff[3]) }
}

// «V3.5.31» for ett enkelt tall, «V3.5.31–33» for et spenn (laveste patch
// først, én dash — U+2013, ikke bindestrek).
function visningFor(major: number, minor: number, lav: number, hoy: number): string {
  const patchDel = lav === hoy ? `${lav}` : `${lav}–${hoy}`
  return `V${major}.${minor}.${patchDel}`
}

function mindreRad(major: number, minor: number, lav: number, hoy: number): LoggRad {
  return { visning: visningFor(major, minor, lav, hoy), tekst: MINDRE_TEKST, mindre: true }
}

/**
 * Bygger visningsklare rader for «Hva er nytt», sortert nyeste-først.
 *
 * Regler (se #595 for full drøfting):
 * 1. Uparsbare versjonsstrenger hoppes over — en infoside skal ikke kaste.
 * 2. Tom liste ⇒ tom liste.
 * 3. Sortering er strengt synkende på (major, minor, patch).
 * 4. Er gjeldende versjon foran nyeste oppføring (samme serie, høyere patch,
 *    eller en helt ny serie der telleren er nullstilt) fylles gapet med én
 *    «mindre»-rad øverst.
 * 5. Et gap MELLOM to oppføringer i samme serie fylles med én «mindre»-rad.
 *    Gap på tvers av serier fylles bevisst ikke — patch-tallet er ikke
 *    sammenlignbart over en serie-grense.
 * 6. Ingenting genereres under eldste oppføring — vi starter fra nå.
 */
export function byggEndringslogg(endringer: Endring[], gjeldendeVersjon: string): LoggRad[] {
  if (endringer.length === 0) return []

  const parset = endringer
    .map(e => {
      const v = parseVersjon(e.versjon)
      return v ? { ...v, dato: e.dato, tekst: e.tekst } : null
    })
    .filter((v): v is ParsetVersjon & { dato: string; tekst: string } => v !== null)

  if (parset.length === 0) return []

  parset.sort((a, b) => b.major - a.major || b.minor - a.minor || b.patch - a.patch)

  const rader: LoggRad[] = []

  const gjeldende = parseVersjon(gjeldendeVersjon)
  if (gjeldende) {
    const nyeste = parset[0]
    const sammeSerie = gjeldende.major === nyeste.major && gjeldende.minor === nyeste.minor
    const nyereSerie =
      gjeldende.major > nyeste.major ||
      (gjeldende.major === nyeste.major && gjeldende.minor > nyeste.minor)

    if (sammeSerie && gjeldende.patch > nyeste.patch) {
      rader.push(mindreRad(gjeldende.major, gjeldende.minor, nyeste.patch + 1, gjeldende.patch))
    } else if (nyereSerie) {
      // Ny serie: patch-telleren er nullstilt (se stamp-versjon.mjs), så vi
      // fyller fra 1 — ikke fra forrige series patch-tall.
      rader.push(mindreRad(gjeldende.major, gjeldende.minor, 1, gjeldende.patch))
    }
  }

  for (let i = 0; i < parset.length; i++) {
    const rad = parset[i]
    rader.push({
      visning: visningFor(rad.major, rad.minor, rad.patch, rad.patch),
      dato: rad.dato,
      tekst: rad.tekst,
      mindre: false,
    })

    const neste = parset[i + 1]
    if (
      neste &&
      neste.major === rad.major &&
      neste.minor === rad.minor &&
      rad.patch - neste.patch > 1
    ) {
      rader.push(mindreRad(rad.major, rad.minor, neste.patch + 1, rad.patch - 1))
    }
  }

  return rader
}
