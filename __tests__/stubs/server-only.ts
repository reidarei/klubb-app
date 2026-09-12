// Stub for pakken «server-only» under vitest.
//
// Vitest kjører uten Next sin «react-server»-resolve-condition, så et ekte
// import av server-only ville kastet («This module cannot be imported from
// a Client Component module») utenfor konteksten den er laget for. Denne
// stubben er en tom no-op-modul som lar lib/config.ts (og andre server-only-
// filer) importeres uendret i tester — se vitest.config.ts § resolve.alias.
export {}
