/**
 * Pinner at «Om deg» på /profil (#683) aldri rendrer en blank verdi-celle.
 *
 * Bakgrunn (#683-review, Copilot): raden brukte `verdi ?? 'Ikke satt'`, og
 * nullish coalescing slipper tom streng gjennom. `telefon = ''` i basen ville
 * dermed gitt en tom celle — umulig for medlemmet å skille fra en
 * renderingsfeil. Appens egen skrivesti kan ikke produsere det i dag
 * (normaliserTelefon('') gir null), så tilfellet er ikke nåbart fra e2e mot
 * seeden; derfor pinnes det her i stedet, på komponentnivå.
 *
 * e2e/profil-opplysninger.spec.ts dekker null-grenen ende-til-ende.
 */

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import EgneOpplysninger from '@/components/profil/EgneOpplysninger'

afterEach(cleanup)

const BASIS = {
  navn: 'Ola Testesen',
  visningsnavn: 'Ola',
  fodselsdato: '1990-11-05',
  telefon: '99 88 77 66',
  epost: 'ola@klubb.test',
  matallergier: 'Skalldyr',
  stikkord: ['grillsjef'],
}

describe('EgneOpplysninger — tomme verdier', () => {
  it('viser «Ikke satt» for tom streng, ikke en blank celle', () => {
    render(<EgneOpplysninger {...BASIS} telefon="" matallergier="" epost="" />)
    expect(screen.getAllByText('Ikke satt')).toHaveLength(3)
  })

  it('viser «Ikke satt» for null', () => {
    render(<EgneOpplysninger {...BASIS} telefon={null} fodselsdato={null} matallergier={null} stikkord={[]} />)
    expect(screen.getAllByText('Ikke satt')).toHaveLength(4)
  })

  it('skjuler visningsnavn-raden når feltet er tomt — ikke «Ikke satt»', () => {
    // Tomt visningsnavn betyr «har ikke et eget visningsnavn», samme som null:
    // raden skal da være borte, slik den er når visningsnavnet er lik navnet.
    render(<EgneOpplysninger {...BASIS} visningsnavn="" />)
    expect(screen.queryByText('Visningsnavn')).toBeNull()
    expect(screen.queryByText('Ikke satt')).toBeNull()
  })
})
