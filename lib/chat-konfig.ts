// Sentral konfigurasjon for de fem chat-scopene. Erstatter spredte switch-
// statements i Chat.tsx og 4× kopipasta i lib/actions/chat.ts. Hver scope
// har sin egen tabell, valgfri FK-kolonne, kanal-navn og charLimit. Mention-
// varsler / privat-melding-varsler kobles inn via `postSend`-callbacken slik
// at sendChatMelding kan være helt scope-agnostisk.
//
// Endringer her speiles av RLS-policies i Postgres — RLS er fortsatt
// sannheten. Denne filen er en TS-side bekvemmelighet for kall-ergonomi.

import { CHAT_MAKS_LENGDE, INNLEGG_MAKS_LENGDE } from '@/lib/konstanter'

export type ChatScope =
  | { type: 'arrangement'; arrangementId: string }
  | { type: 'klubb' }
  | { type: 'poll'; pollId: string }
  | { type: 'melding'; meldingId: string }
  | { type: 'privat'; samtaleId: string }

export type ChatScopeType = ChatScope['type']

export type ChatTabell =
  | 'arrangement_chat'
  | 'klubb_chat'
  | 'poll_chat'
  | 'melding_chat'
  | 'samtale_chat'

export type ChatKonfig = {
  tabell: ChatTabell
  /** Navn på FK-kolonnen i chat-tabellen (eller null for klubb-chat). */
  fkFelt: string | null
  /** Henter ut FK-verdien fra et scope. */
  scopeId: (s: ChatScope) => string | null
  /** Stabilt kanalnavn for supabase-realtime per scope-instans. */
  kanalNavn: (s: ChatScope) => string
  /** Maksimalt antall tegn i en melding. Privat = 2000, andre = 500. */
  charLimit: number
}

function antarType<T extends ChatScopeType>(s: ChatScope, t: T): asserts s is Extract<ChatScope, { type: T }> {
  if (s.type !== t) throw new Error(`Forventet scope-type ${t}, fikk ${s.type}`)
}

export const CHAT_KONFIG: Record<ChatScopeType, ChatKonfig> = {
  arrangement: {
    tabell: 'arrangement_chat',
    fkFelt: 'arrangement_id',
    scopeId: s => {
      antarType(s, 'arrangement')
      return s.arrangementId
    },
    kanalNavn: s => {
      antarType(s, 'arrangement')
      return `chat-arr-${s.arrangementId}`
    },
    charLimit: CHAT_MAKS_LENGDE,
  },
  klubb: {
    tabell: 'klubb_chat',
    fkFelt: null,
    scopeId: () => null,
    kanalNavn: () => 'chat-klubb',
    charLimit: CHAT_MAKS_LENGDE,
  },
  poll: {
    tabell: 'poll_chat',
    fkFelt: 'poll_id',
    scopeId: s => {
      antarType(s, 'poll')
      return s.pollId
    },
    kanalNavn: s => {
      antarType(s, 'poll')
      return `chat-poll-${s.pollId}`
    },
    charLimit: CHAT_MAKS_LENGDE,
  },
  melding: {
    tabell: 'melding_chat',
    fkFelt: 'melding_id',
    scopeId: s => {
      antarType(s, 'melding')
      return s.meldingId
    },
    kanalNavn: s => {
      antarType(s, 'melding')
      return `chat-melding-${s.meldingId}`
    },
    charLimit: CHAT_MAKS_LENGDE,
  },
  privat: {
    tabell: 'samtale_chat',
    fkFelt: 'samtale_id',
    scopeId: s => {
      antarType(s, 'privat')
      return s.samtaleId
    },
    kanalNavn: s => {
      antarType(s, 'privat')
      return `chat-privat-${s.samtaleId}`
    },
    charLimit: INNLEGG_MAKS_LENGDE,
  },
}

export function konfigFor(scope: ChatScope): ChatKonfig {
  return CHAT_KONFIG[scope.type]
}

// Stier som skal revalideres etter en chat-mutasjon. Kun scopes som faktisk
// rendres på forsiden får '/' — ellers river vi unødvendig Next.js-cache.
// se #316
export function revalideringsPaths(scope: ChatScope): string[] {
  switch (scope.type) {
    case 'arrangement':
      return ['/', `/arrangementer/${scope.arrangementId}`]
    case 'poll':
      return ['/', `/poll/${scope.pollId}`]
    case 'melding':
      return ['/', `/meldinger/${scope.meldingId}`]
    case 'klubb':
      // Klubb-chat vises ikke på forsiden — kun /chat trenger revalidering
      return ['/chat']
    case 'privat':
      // Privatsamtaler vises ikke på forsiden
      return [`/samtaler/${scope.samtaleId}`]
    default: {
      // Tvinger kompileringsfeil hvis en ny ChatScope-variant glemmes her,
      // og kaster tydelig ved runtime i stedet for å returnere undefined. se #316
      const ukjent: never = scope
      throw new Error(`Ukjent chat-scope: ${JSON.stringify(ukjent)}`)
    }
  }
}
