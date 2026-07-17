/**
 * Delt type for grupperte reaksjoner — brukes av MeldingReaksjoner (melding_reaksjon)
 * og KommentarReaksjoner (chat_reaksjoner). Tidligere lå typen i MeldingReaksjoner.tsx
 * og ble importert på tvers; det lekket «melding» som konsept inn i kommentar-koden.
 * Egen fil hindrer det, og gir en naturlig plass for framtidig delt logikk. se #359.
 */
export type ReaksjonGruppe = { emoji: string; profilIder: string[] }

/**
 * Har brukeren allerede reagert med denne emojien? Ren spørring mot grupperte
 * reaksjoner — brukt av useReaksjoner (lib/reaksjoner-hook.ts) og
 * KommentarReaksjoner for å avgjøre om toggle skal legge til eller fjerne.
 */
export function harBrukerReagert(grupper: ReaksjonGruppe[], brukerId: string, emoji: string): boolean {
  const finnes = grupper.find(r => r.emoji === emoji)
  return finnes?.profilIder.includes(brukerId) ?? false
}

/**
 * Invarianten «én reaksjon per bruker, rydd tomme grupper» defineres her —
 * ett sted for all gruppert (ReaksjonGruppe[]) optimistisk toggle-logikk.
 * Chat-hooken (components/chat/hooks/useChatReaksjoner.ts) speiler denne
 * bevisst på en flat liste pga realtime-modellen der — se #472/#475.
 */
export function toggleReaksjonGrupper(grupper: ReaksjonGruppe[], brukerId: string, emoji: string): ReaksjonGruppe[] {
  const harReagert = harBrukerReagert(grupper, brukerId, emoji)

  // Én reaksjon per bruker: fjern brukeren fra alle grupper før en
  // eventuell ny legges til.
  const utenBruker = grupper.map(r => ({
    ...r,
    profilIder: r.profilIder.filter(p => p !== brukerId),
  }))
  const ferdig = harReagert
    ? utenBruker
    : utenBruker.map(r => r.emoji === emoji ? { ...r, profilIder: [...r.profilIder, brukerId] } : r)

  const harGruppe = ferdig.some(r => r.emoji === emoji)
  const utvidet = !harReagert && !harGruppe
    ? [...ferdig, { emoji, profilIder: [brukerId] }]
    : ferdig

  return utvidet.filter(r => r.profilIder.length > 0)
}
