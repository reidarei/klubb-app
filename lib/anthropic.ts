// Tynn transport-wrapper mot Anthropic Messages API.
// Bruker rå fetch i stedet for @anthropic-ai/sdk — samme husregel som
// lib/r2.ts / aws4fetch: unngå tung SDK-bundle (~200 KB) for enkel POST-logikk.
//
// PII-fritt: denne modulen logger ALDRI meldingsinnhold. Domene-logging
// (fingerprinting, kontekst) hører i action-laget (lib/actions/dato-forslag.ts).

import { ANTHROPIC_API_KEY, ANTHROPIC_MODEL } from '@/lib/config'

export async function kallClaude({
  system,
  messages,
  maxTokens,
  signal,
}: {
  system: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  maxTokens: number
  signal?: AbortSignal
}): Promise<string | null> {
  // Tom nøkkel = feature er skrudd av. Returnerer null uten fetch slik at
  // build og kjøretid fungerer uten ANTHROPIC_API_KEY satt i env.
  if (!ANTHROPIC_API_KEY) return null

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      temperature: 0,
      system,
      messages,
    }),
    // 8 sekunder timeout om ingen signal er oppgitt — hindrer at ett tregt
    // Anthropic-kall blokkerer en server action urimelig lenge. Var 4 s, men
    // cold start + API-kø kunne ryke på det selv når alt var friskt (#462).
    signal: signal ?? AbortSignal.timeout(8000),
  })

  // fetch() kaster IKKE på HTTP-feil (401, 429, 5xx) — res.ok må sjekkes
  // eksplisitt. Vi kaster en normalisert feil med status slik at action-laget
  // kan fingerprinte auth-feil (401) mot transiente feil (429/timeout).
  if (!res.ok) {
    const e = new Error(`Anthropic ${res.status}`) as Error & { status?: number }
    e.status = res.status
    throw e
  }

  // Defensivt: ta ikke for gitt at responsen har formen vi forventer.
  // content[0] kan mangle hvis modellen returnerer tom respons.
  const data = await res.json()
  const block = data?.content?.[0]
  return block?.type === 'text' ? (block.text as string) : null
}
