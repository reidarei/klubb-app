// Rene typer og hjelpere for arrangement-mal-valget. Ingen 'use client' — brukes
// både server- og klient-side. TypeVelger.tsx ('use client') re-importerer
// herfra.

export type MalValg = {
  // Stabilt nøkkel for React-rendering og seleksjon: `${arrangement_navn}::${aar ?? ''}`
  key: string
  mal_navn: string // 'Mai-juni møte' | ... | 'Annet'
  aar: number | null // null for "Annet"
  type: 'moete' | 'tur' | null // null for "Annet" — brukeren må velge
  purredato: string | null // 'YYYY-MM-DD' med riktig år (ikke mal-dato med år 2000)
  ansvarlige: string[] // navn, kun for visning/tooltip
  ansvarligeIds: string[] // profil-IDer — brukes for å avgjøre om innlogget bruker har dette ansvaret
}

export const ANNET_KEY = 'Annet::'

export function byggAnnetValg(): MalValg {
  return {
    key: ANNET_KEY,
    mal_navn: 'Annet',
    aar: null,
    type: null,
    purredato: null,
    ansvarlige: [],
    ansvarligeIds: [],
  }
}
