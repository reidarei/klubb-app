// Kontrakter i app/globals.css som CSS selv ikke kan håndheve (#851):
//   1. :root[data-theme="dark"] speiler :root (mørk default) manuelt.
//   2. min-height på .skjemafelt er MIN_TREFFMAAL_PX (CSS kan ikke importere den).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { MIN_TREFFMAAL_PX } from '@/lib/konstanter'

const CSS = readFileSync(path.resolve(__dirname, '../app/globals.css'), 'utf-8')
  .replace(/\r\n/g, '\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

// Toppnivå-blokk: selektoren står i kolonne 0, og blokka slutter på første
// «}» i kolonne 0. Blokkene inneholder ingen nestede regler.
function blokk(selektor: string): string {
  const start = CSS.indexOf(`\n${selektor} {\n`)
  if (start < 0) throw new Error(`fant ikke ${selektor} i globals.css`)
  const slutt = CSS.indexOf('\n}\n', start + 1)
  return CSS.slice(start + selektor.length + 3, slutt)
}

function deklarasjoner(tekst: string): Map<string, string> {
  const m = new Map<string, string>()
  for (const d of tekst.split(';')) {
    const kolon = d.indexOf(':')
    if (kolon < 0) continue
    m.set(d.slice(0, kolon).trim(), d.slice(kolon + 1).replace(/\s+/g, ' ').trim())
  }
  return m
}

const rot = deklarasjoner(blokk(':root'))
const moerk = deklarasjoner(blokk(':root[data-theme="dark"]'))
const lys = deklarasjoner(blokk(':root[data-theme="light"]'))

describe('globals.css: mørk blokk speiler :root', () => {
  it('hver prop i [data-theme="dark"] finnes i :root med samme verdi', () => {
    const avvik = [...moerk]
      .filter(([k, v]) => rot.get(k) !== v)
      .map(([k, v]) => `${k}: dark=«${v}» root=«${rot.get(k) ?? '(mangler)'}»`)
    expect(avvik).toEqual([])
  })

  // Omvendt der det gir mening: en prop lyst tema overstyrer er tema-avhengig,
  // og må da ha en mørk verdi både i :root og i den mørke blokka. Rene
  // tema-uavhengige props (safe-area o.l.) står kun i :root.
  it('hver prop lyst tema overstyrer finnes i både :root og [data-theme="dark"]', () => {
    const mangler = [...lys.keys()].flatMap(k => [
      ...(rot.has(k) ? [] : [`${k} mangler i :root`]),
      ...(moerk.has(k) ? [] : [`${k} mangler i [data-theme="dark"]`]),
    ])
    expect(mangler).toEqual([])
  })
})

describe('globals.css: skjemafelt-høyde', () => {
  it('min-height på .skjemafelt = MIN_TREFFMAAL_PX', () => {
    const regel = CSS.match(/:is\(\.skjemafelt, \.skjemafelt \*\)[^{]*\{([^}]*)\}/)
    expect(regel, 'fant ikke .skjemafelt-regelen').not.toBeNull()
    expect(regel![1]).toMatch(new RegExp(`min-height:\\s*${MIN_TREFFMAAL_PX}px`))
  })
})
