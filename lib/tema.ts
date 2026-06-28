// Tynt JS-speil av tokens i app/globals.css. Brukes der CSS-variabler ikke
// er tilgjengelig (manifest JSON, e-postmaler, ICS-filer).
// SYNKRONISERES MANUELT med globals.css — se docs/tema-arkitektur.md §3.

export const MANIFEST_FARGER = {
  bakgrunn: '#060608',  // matcher dagens manifest.ts og <meta theme-color>; #323 oppdaterer til '#0e0f13'
  tema: '#060608',
} as const

export const EPOST_FARGER = {
  bakgrunn: '#0e0f13',
  aksent: '#e8d9b5',
  tekst: '#f5f5f7',
  tekstSekundaer: '#dadce2',
} as const

// brukes når ICS-generator får farge-emoji-utvidelse senere
export const ICS_FARGE = '#e8d9b5'
