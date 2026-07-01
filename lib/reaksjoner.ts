/**
 * Delt type for grupperte reaksjoner — brukes av MeldingReaksjoner (melding_reaksjon)
 * og KommentarReaksjoner (chat_reaksjoner). Tidligere lå typen i MeldingReaksjoner.tsx
 * og ble importert på tvers; det lekket «melding» som konsept inn i kommentar-koden.
 * Egen fil hindrer det, og gir en naturlig plass for framtidig delt logikk. se #359.
 */
export type ReaksjonGruppe = { emoji: string; profilIder: string[] }
