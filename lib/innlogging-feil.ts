// Hva innloggingssiden sier når signInWithPassword feiler, og om feilen skal
// meldes til feil_logg (#869).
//
// Bakgrunn: siden mappet tidligere ALL feil til «Feil e-post eller passord.».
// Da custom_access_token_hook (mig. 166) kom, ville en hook som kaster ha fått
// GoTrue til å svare feil — og en mann med riktig passord ville ha blitt fortalt
// at passordet var galt. Bare invalid_credentials betyr faktisk feil passord.
//
// Ren funksjon uten React/Supabase-import, så den kan testes uten rendering.

export type InnloggingFeilInput = { code?: string; status?: number }

export type InnloggingFeil = {
  tekst: string
  /** null = ikke meld til feil_logg (vanlig feil passord). */
  beacon: null | { nivaa: 'warn' | 'error' }
}

export function innloggingsFeil(error: InnloggingFeilInput): InnloggingFeil {
  if (error.code === 'invalid_credentials') {
    return { tekst: 'Feil e-post eller passord.', beacon: null }
  }
  // Rate-limit hos GoTrue (30 innlogginger per 5 min per IP): brukerutløst og
  // forbigående, så warn.
  if (error.status === 429 || error.code === 'over_request_rate_limit') {
    return { tekst: 'For mange forsøk. Vent litt og prøv igjen.', beacon: { nivaa: 'warn' } }
  }
  // supabase-js gir status 0 (AuthRetryableFetchError) når fetch selv feiler.
  if (error.status === 0) {
    return { tekst: 'Fikk ikke kontakt. Sjekk nettet og prøv igjen.', beacon: { nivaa: 'warn' } }
  }
  return { tekst: 'Noe gikk galt hos oss — prøv igjen om litt', beacon: { nivaa: 'error' } }
}
