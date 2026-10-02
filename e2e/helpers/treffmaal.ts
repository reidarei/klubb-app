import { test, expect, type Page } from '@playwright/test'
import { MIN_TREFFMAAL_PX } from '../../lib/konstanter'
import { TREFFMAAL_UNNTAK } from './treffmaal-unntak'

/**
 * forventTreffbar() — den egentlige vakten bak #700 PR 2.
 *
 * Playwright klikker alltid programmatisk i midten av et element og treffer
 * uansett størrelse — en `.click()` kan derfor aldri bevise at en FINGER
 * treffer noe. Denne hjelperen måler i stedet GEOMETRIEN: er kortsiden minst
 * MIN_TREFFMAAL_PX, og er alle fem prøvepunktene faktisk elementets eget
 * areal (ikke dekket/klippet av noe annet)?
 *
 * Fem punkter i et PLUSS-mønster (midten + fire punkter langs aksene), IKKE
 * fire hjørner: et sirkulært element (border-radius: 50%, f.eks. en rund
 * picker-knapp) har hjørnepunktene UTENFOR sirkelen selv når elementet er
 * perfekt sirkelformet og stort nok — en hjørnetest ville gitt falske brudd
 * på hver rund knapp i appen. Plusset ligger alltid inne i både kvadrat og
 * sirkel av samme kortside.
 *
 * Målingen skjer i to pass:
 * 1. Et BÅNDSCROLL fra toppen (høyde − 100 px per runde) som måler hver
 *    kandidat i det øyeblikket den er HELT innenfor viewporten.
 * 2. For alt som ikke ble en ren OK i pass 1 (aldri sett, eller sett men
 *    brøt), et individuelt `scrollIntoView({block:'center'})` + ny måling.
 *    Dette fanger en sticky TopHeader som stjeler toppunktene akkurat i det
 *    øyeblikket et element blir «helt synlig» i et båndscroll — men som ikke
 *    er i veien når elementet står midt i viewporten.
 *
 * Et element som ALDRI kommer innenfor viewporten i noen av passene (f.eks.
 * en rad i et lukket sidepanel, flyttet ut med `transform`, ikke scroll)
 * rapporteres som «ikke målt» — IKKE som brudd. Vakten måler kun
 * default-tilstanden; dybde-kall i spec-er som åpner panelet dekker resten.
 *
 * Alt skjer i ÉN `page.evaluate()` (ytelse — mønster fra
 * filter-chip-treffomraade.spec.ts): to rAF + `document.fonts.ready` gir
 * stabil layout før første måling.
 */

const KANDIDAT_SELEKTOR =
  'a[href], button, [role=button], [role=link], [role=tab], [role=switch], ' +
  '[role=checkbox], [role=radio], [role=menuitem], select, textarea, ' +
  'input:not([type=hidden]), summary, .leaflet-interactive'

// Fail-closed tak på antall scroll-runder i bånd-passet. En side som aldri
// når "bunnen" (f.eks. en evig-scroll-feil) skal gi et synlig, begrenset
// resultat — ikke en hengende test.
const MAKS_SCROLL_RUNDER = 25

type Brudd = { beskrivelse: string; bredde: number; hoyde: number; bomPunkter: number }

type BrowserResultat = {
  sti: string
  kandidater: number
  kandidaterIGulvOmraade: number
  maalt: number
  unntatt: number
  skjult: number
  inlineLenker: number
  ikkeMaalt: number
  brudd: Brudd[]
}

type Resultat = BrowserResultat & { kontekst: string }

type Opts = {
  /** Fri tekst til rapporten — typisk ruten eller «ruten, panelet åpent». */
  kontekst: string
  /**
   * CSS-selektor(liste) som avgrenser hvilke DOM-trær kandidater søkes i.
   * Default 'body'. En oppgitt selektor uten treff KASTER — faller aldri til body.
   */
  omraade?: string
  /** Fail-closed gulv for kandidaterIGulvOmraade (målte + synlige unntak). Default 1. */
  gulv?: number
  /** Selektor dekningsgulvet telles i. Default = omraade. Må ligge innenfor omraade. Kaster uten treff. */
  gulvOmraade?: string
  /**
   * Skal `brudd` gjøre TESTEN rød? Default true.
   *
   * Satt til `false` KUN av bredde-sveipen i sider-laster.spec.ts (#700 PR 2):
   * etter PR 2s egen fiks (ToggleSwitch/SkjemaBar/SegmentPiller/Segment) var
   * 32/37 ruter fortsatt røde på tilbake-/brødsmulelenker, input/textarea/
   * select-felthøyde og en håndfull småknapper — et strukturelt mønster som
   * krever en felles komponent (tilbake-lenke, felles felthøyde ≥ 44 px), ikke
   * punktfikser. Beslutning i #700: land PR 2 med bredde i RAPPORT-modus
   * (bruddet vises i treffmaal-rapport.ts, gjør ikke testen rød) og la PR 3
   * bygge komponenten og snu denne til `true`. Gulvet (kandidaterIGulvOmraade)
   * er IKKE påvirket av dette flagget — det forblir hardt uansett.
   *
   * Dybde-kallene (kart-markering.spec.ts, album-chatten-lightbox.spec.ts,
   * edit-kommentar.spec.ts, kart-pakke.spec.ts) bruker default (`true`) og
   * skal ALDRI settes til `false` — de måler en konkret, nylig bygget flate
   * der et brudd er en reell regresjon, ikke et strukturelt etterslep.
   * Eneste unntak: poll.spec.ts (/poll/ny) står på `false` fordi bruddene der
   * er felthøyde-mønsteret PR 3 lukker — snus sammen med det (se KJENTE_MANGLER).
   */
  bruddBlokkerer?: boolean
}

// Serialiserbar form av unntakslisten — page.evaluate() får kun denne, aldri
// RegExp-instansene direkte.
const UNNTAK_SERIALISERT = TREFFMAAL_UNNTAK.map(u => ({
  ruteStr: typeof u.rute === 'string' ? u.rute : undefined,
  ruteRegex: u.rute instanceof RegExp ? { source: u.rute.source, flags: u.rute.flags } : undefined,
  selektor: u.selektor,
}))

export async function forventTreffbar(page: Page, opts: Opts): Promise<Resultat> {
  const { kontekst, omraade = 'body', gulv = 1, bruddBlokkerer = true } = opts
  const gulvOmraade = opts.gulvOmraade ?? omraade

  const resultat: BrowserResultat = await page.evaluate(
    async ({ selektor, omraadeSel, gulvOmraadeSel, minPx, maksRunder, unntak }) => {
      await document.fonts.ready
      await new Promise(requestAnimationFrame)
      await new Promise(requestAnimationFrame)

      // En OPPGITT selektor som ikke finnes skal feile høyt, aldri falle stille
      // til <body> (da ville vakten målt hele siden og sagt «grønt» om en flate
      // som aldri ble åpnet). Kun default (ingen omraade oppgitt) er 'body'.
      // querySelectorAll, ikke querySelector: en selektorliste
      // ('.leaflet-marker-pane, .leaflet-tooltip-pane') skal gi ALLE treffene.
      const finnRoetter = (sel: string, hva: string): Element[] => {
        const roetter = Array.from(document.querySelectorAll(sel))
        if (roetter.length === 0) {
          throw new Error(`forventTreffbar: ${hva} "${sel}" finnes ikke på ${location.pathname}`)
        }
        return roetter
      }
      const omraadeRoetter = finnRoetter(omraadeSel, 'omraade')
      const gulvRoetter = finnRoetter(gulvOmraadeSel, 'gulvOmraade')
      const innenfor = (roetter: Element[], el: Element) => roetter.some(r => r.contains(el))

      // Checkbox/radio inni en <label> måles som LABEL-en — WCAG-flaten
      // brukeren faktisk trykker på er hele label-rekken, ikke 16×16-boksen.
      const sett = new Set<Element>()
      const alle: Element[] = []
      for (const el of Array.from(document.querySelectorAll(selektor))) {
        let maal: Element = el
        if (el.tagName === 'INPUT') {
          const type = (el.getAttribute('type') ?? '').toLowerCase()
          if (type === 'checkbox' || type === 'radio') {
            const label = el.closest('label')
            if (label) maal = label
          }
        }
        if (sett.has(maal)) continue
        sett.add(maal)
        alle.push(maal)
      }

      const iOmraade = alle.filter(el => innenfor(omraadeRoetter, el))

      const erSkjult = (el: Element): boolean => {
        const anyEl = el as Element & { checkVisibility?: (opts: Record<string, boolean>) => boolean }
        if (
          typeof anyEl.checkVisibility === 'function' &&
          !anyEl.checkVisibility({ opacityProperty: true, visibilityProperty: true })
        ) {
          return true
        }
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) return true
        const cs = getComputedStyle(el)
        if (cs.pointerEvents === 'none') return true
        if (cs.clipPath && cs.clipPath.includes('inset(50%')) return true
        if (cs.clip && /rect\(/.test(cs.clip)) return true
        if (el.closest('[inert], [aria-hidden="true"]')) return true
        return false
      }

      // WCAG 2.5.8-unntaket: en lenke i løpende tekst (inline, med egen
      // tekst som nabo i samme forelder) er ikke pålagt 44 px.
      const erInlineLenke = (el: Element): boolean => {
        if (el.tagName !== 'A') return false
        if (getComputedStyle(el).display !== 'inline') return false
        const forelder = el.parentElement
        if (!forelder) return false
        for (const node of Array.from(forelder.childNodes)) {
          if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim().length > 0) return true
        }
        return false
      }

      const matcherRute = (u: { ruteStr?: string; ruteRegex?: { source: string; flags: string } }) => {
        if (u.ruteStr !== undefined) return location.pathname === u.ruteStr
        if (u.ruteRegex) return new RegExp(u.ruteRegex.source, u.ruteRegex.flags).test(location.pathname)
        return false
      }
      const erUnntatt = (el: Element) => unntak.some(u => matcherRute(u) && el.matches(u.selektor))

      let unntattAntall = 0
      let skjultAntall = 0
      let inlineAntall = 0
      const sjekkbare: Element[] = []
      // Unntatte elementer som faktisk er SYNLIGE — de teller i gulvet (en
      // side skal ikke «miste» gulvet fordi det eneste interessante er
      // unntatt), men et skjult unntak skal ikke kunne fylle det.
      const synligeUnntak: Element[] = []
      for (const el of iOmraade) {
        if (erUnntatt(el)) {
          unntattAntall++
          if (!erSkjult(el)) synligeUnntak.push(el)
          continue
        }
        if (erSkjult(el)) {
          skjultAntall++
          continue
        }
        if (erInlineLenke(el)) {
          inlineAntall++
          continue
        }
        sjekkbare.push(el)
      }

      const beskriv = (el: Element): string => {
        const tag = el.tagName.toLowerCase()
        const navn = el.getAttribute('aria-label') || (el.textContent ?? '').trim().slice(0, 30)
        const testid = el.getAttribute('data-testid')
        return `${tag}${navn ? ` "${navn}"` : ''}${testid ? ` [data-testid=${testid}]` : ''}`
      }

      type Sjekk = { feilet: boolean; bredde: number; hoyde: number; bomPunkter: number }

      const sjekkElement = (el: Element): Sjekk => {
        const r = el.getBoundingClientRect()
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        // Pluss, ikke hjørner (se filhode) — avstand fra senter langs hver akse.
        // minPx/2 − 1 (= 21 ved 44): ytterpunktene ligger 1 px innenfor kanten
        // av et 44 px område, så de spenner faktisk ut hele kravet (42 px av
        // 44). Den ene pikselen er margin for subpiksel-avrunding i
        // elementFromPoint — også et element på 43,5 px (toleransen under)
        // har punktene 0,75 px innenfor kanten.
        const off = minPx / 2 - 1
        const punkter: [number, number][] = [
          [cx, cy],
          [cx - off, cy],
          [cx + off, cy],
          [cx, cy - off],
          [cx, cy + off],
        ]
        let bom = 0
        for (const [x, y] of punkter) {
          // Utenfor viewporten kan ikke hit-testes. Skjer kun for et element
          // som uansett er for lite (målingen krever ellers at elementet står
          // helt i viewporten), og det fanges av kortside-sjekken.
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue
          // null = ingenting å treffe i punktet — en finger der treffer ikke
          // elementet, så det er en bom, ikke et punkt å hoppe over.
          const truffet = document.elementFromPoint(x, y)
          if (!truffet || (truffet !== el && !el.contains(truffet))) bom++
        }
        const kortside = Math.min(r.width, r.height)
        // 0,5 px toleranse — kun for reell subpiksel-avrunding (en 44 px boks
        // kan måle 43,9x ved brøk-skalering/zoom). En hel piksel ville sluppet
        // gjennom 43 px-elementer, som er et faktisk brudd.
        return {
          feilet: kortside < minPx - 0.5 || bom > 0,
          bredde: Math.round(r.width),
          hoyde: Math.round(r.height),
          bomPunkter: bom,
        }
      }

      const erFulltIViewport = (el: Element): boolean => {
        const r = el.getBoundingClientRect()
        return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && r.width > 0 && r.height > 0
      }

      // ─── Pass 1: båndscroll ─────────────────────────────────────────────
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
      await new Promise(requestAnimationFrame)
      await new Promise(requestAnimationFrame)

      const resultatPerEl = new Map<Element, Sjekk | null>()
      let runde = 0
      while (runde < maksRunder) {
        for (const el of sjekkbare) {
          if (resultatPerEl.has(el)) continue
          if (erFulltIViewport(el)) resultatPerEl.set(el, sjekkElement(el))
        }
        const se = document.scrollingElement ?? document.documentElement
        if (se.scrollTop + innerHeight >= se.scrollHeight - 1) break
        window.scrollBy({ top: innerHeight - 100, left: 0, behavior: 'instant' })
        await new Promise(requestAnimationFrame)
        await new Promise(requestAnimationFrame)
        runde++
      }

      // ─── Pass 2: sentrert re-måling av alt som ikke ble en ren OK ───────
      const ikkeOk = sjekkbare.filter(el => {
        const r = resultatPerEl.get(el)
        return !r || r.feilet
      })
      for (const el of ikkeOk) {
        ;(el as HTMLElement).scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
        await new Promise(requestAnimationFrame)
        await new Promise(requestAnimationFrame)
        if (erFulltIViewport(el)) {
          resultatPerEl.set(el, sjekkElement(el))
        } else if (!resultatPerEl.has(el)) {
          // Aldri sett i noen av passene — «ikke målt», ikke brudd.
          resultatPerEl.set(el, null)
        }
        // Var det et pass1-brudd og kommer FORTSATT ikke i viewport i pass 2,
        // beholdes pass1-resultatet (feilet=true) — fortsatt et reelt brudd.
      }

      const brudd: Brudd[] = []
      let ikkeMaaltAntall = 0
      let maaltAntall = 0
      for (const el of sjekkbare) {
        const r = resultatPerEl.get(el)
        if (r === null || r === undefined) {
          ikkeMaaltAntall++
          continue
        }
        maaltAntall++
        if (r.feilet) {
          brudd.push({ beskrivelse: beskriv(el), bredde: r.bredde, hoyde: r.hoyde, bomPunkter: r.bomPunkter })
        }
      }

      // Fail-closed dekningsgulv (se e2e/helpers/ruter.ts): teller KUN det som
      // faktisk ble målt (brudd eller ikke) pluss synlige unntak — aldri
      // skjulte, inline eller ikke-målte kandidater, som ellers kunne fylt
      // gulvet uten at vakten så en eneste trykkflate. Kun elementer i
      // omraade måles, så gulvOmraade må ligge innenfor det.
      const maalteEl = sjekkbare.filter(el => resultatPerEl.get(el))
      const kandidaterIGulvOmraade = [...maalteEl, ...synligeUnntak].filter(el =>
        innenfor(gulvRoetter, el),
      ).length

      return {
        sti: location.pathname,
        kandidater: iOmraade.length,
        kandidaterIGulvOmraade,
        maalt: maaltAntall,
        unntatt: unntattAntall,
        skjult: skjultAntall,
        inlineLenker: inlineAntall,
        ikkeMaalt: ikkeMaaltAntall,
        brudd,
      }
    },
    {
      selektor: KANDIDAT_SELEKTOR,
      omraadeSel: omraade,
      gulvOmraadeSel: gulvOmraade,
      minPx: MIN_TREFFMAAL_PX,
      maksRunder: MAKS_SCROLL_RUNDER,
      unntak: UNNTAK_SERIALISERT,
    },
  )

  const fullResultat: Resultat = { kontekst, ...resultat }

  await test.info().attach('treffmaal', {
    contentType: 'application/json',
    body: JSON.stringify(fullResultat, null, 2),
  })

  expect(
    fullResultat.kandidaterIGulvOmraade,
    `${kontekst}: forventet minst ${gulv} målte (synlige, ikke-inline) trykkflater i "${gulvOmraade}", fant ` +
      `${fullResultat.kandidaterIGulvOmraade}. Dekningsgulvet (jf. MIN_TEGN_I_MAIN-presedens i ` +
      `sider-laster.spec.ts) fanger at siden/tilstanden sannsynligvis ikke ble målt i det hele tatt.`,
  ).toBeGreaterThanOrEqual(gulv)

  if (bruddBlokkerer) {
    expect(
      fullResultat.brudd,
      `${kontekst}: ${fullResultat.brudd.length} trykkflate(r) under ${MIN_TREFFMAAL_PX} px på kortsiden, ` +
        `eller med bom-punkter i sjekken:\n` +
        fullResultat.brudd
          .map(b => `  - ${b.beskrivelse}: ${b.bredde}×${b.hoyde} px, ${b.bomPunkter} bom-punkt(er)`)
          .join('\n'),
    ).toEqual([])
  } else if (fullResultat.brudd.length > 0) {
    // Rapport-modus (#700 PR 2, se kommentaren på `bruddBlokkerer` over) — et
    // brudd skal fortsatt være SYNLIG per test, bare ikke gjøre den rød. Både
    // test.info().annotations (vises i denne testens egen rapport) og
    // treffmaal-rapport.ts (samlet markdown via attachmentet over) dekker det.
    test.info().annotations.push({
      type: 'bredde: kun rapport inntil PR 3, #700',
      description: `${fullResultat.brudd.length} trykkflate(r): ` +
        fullResultat.brudd.map(b => `${b.beskrivelse} (${b.bredde}×${b.hoyde}px)`).join(', '),
    })
  }

  return fullResultat
}
