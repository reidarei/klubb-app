// Opprett første admin på en fersk Supabase-instans.
//
// ANBEFALT FREMGANGSMÅTE: Bruk Supabase Dashboard (Authentication → Add user)
// + SQL: UPDATE profiles SET rolle = 'admin', navn = '...' WHERE id = '...';
// Det er det tryggeste og minst feilsårbare for en engangsoperasjon.
//
// Dette scriptet er alternativet («advanced») — nyttig ved scripted oppsett
// eller katastrofegjenoppretting. Det nekter å kjøre mot prod-instansen og
// mot en instans som allerede har profiler.
//
// Kjøres: node --env-file=.env.local scripts/init-admin.mjs <epost> [navn]
//
// Etter kjøring: logg inn, gå til Profil → Rediger, og bytt passordet straks.

import { createClient } from '@supabase/supabase-js'
import * as fs from 'node:fs'
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { randomBytes } from 'node:crypto'

// ─── Hjelpere ───────────────────────────────────────────────────────────────

// Kjent prod-Supabase-URL (speil av KJENT_PROD_SUPABASE_URL i lib/config.ts).
// .mjs kan ikke importere TypeScript-moduler, så vi dupliserer konstanten her
// med kommentar om at de to skal holdes i synk. Se lib/config.ts.
const KJENT_PROD_SUPABASE_URL = 'https://tdlfswmxezjdnxcbbiwn.supabase.co'

function avbryt(melding) {
  console.error(`\n  AVBRUTT: ${melding}\n`)
  process.exit(1)
}

// Generer et sterkt tilfeldig passord (24 tegn, base64url uten padding).
function genererPassord() {
  return randomBytes(18).toString('base64url')
}

// Venter på at profiles-raden opprettes av trigger handle_ny_bruker (011).
// Trigger-retten er asynkron; vi poller opptil ~5 sekunder.
async function ventPaaProfil(adminClient, userId, maxForsok = 10) {
  for (let i = 0; i < maxForsok; i++) {
    const { data } = await adminClient
      .from('profiles')
      .select('id')
      .eq('id', userId)
      .maybeSingle()
    if (data) return true
    await new Promise(r => setTimeout(r, 500))
  }
  return false
}

// ─── Validering av argumenter ────────────────────────────────────────────────

const [, , epost, navnArg] = process.argv
if (!epost) {
  console.error('Bruk: node --env-file=.env.local scripts/init-admin.mjs <epost> [navn]')
  process.exit(1)
}

const SUPABASE_URL           = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY
const SUPABASE_ANON_KEY      = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  avbryt('NEXT_PUBLIC_SUPABASE_URL og SUPABASE_SERVICE_ROLE_KEY må være satt i .env.local')
}

// ─── Lag 1: Nekter å kjøre mot kjent prod-URL ────────────────────────────────
// Prod-instansen er i aktiv bruk; init-scriptet skal aldri kjøre der selv om
// noen ved uhell peker .env.local mot prod.

if (SUPABASE_URL === KJENT_PROD_SUPABASE_URL) {
  avbryt(
    'SUPABASE_URL peker mot kjent prod-instans. ' +
    'Dette scriptet kjøres kun på ferske / lokale instanser.\n' +
    '  Vil du opprette admin i prod? Bruk Supabase Dashboard i stedet.'
  )
}

// ─── Klientoppsett ───────────────────────────────────────────────────────────

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── Lag 2: Nekter å kjøre hvis profiles ikke er tom ─────────────────────────
// Beskytter mot å kjøre ved uhell på en instans som allerede er i bruk.

const { count, error: telFeil } = await adminClient
  .from('profiles')
  .select('*', { count: 'exact', head: true })

if (telFeil) avbryt(`Klarte ikke telle profiler: ${telFeil.message}`)

if (count > 0) {
  // Idempotens-gren: re-kjøring etter delvis feil (kun hvis eposten finnes).
  // Vi gjør ikke en full abort — sjekk om akkurat denne eposten finnes.
  const { data: eksisterende } = await adminClient
    .from('profiles')
    .select('id, rolle, navn')
    .eq('epost', epost)
    .maybeSingle()

  if (!eksisterende) {
    avbryt(
      `profiles-tabellen er ikke tom (${count} rad(er)), og eposten ${epost} ` +
      'finnes ikke der fra før. Scriptet er ment for ferske instanser, eller ' +
      'for re-kjøring med samme epost etter at Lag 1 (auth-bruker) gikk gjennom.\n\n' +
      'Hvis du vil legge til denne adminen likevel:\n' +
      '  1. Opprett brukeren via Supabase Dashboard → Authentication → Users\n' +
      '  2. Sett rollen via SQL i Dashboard:\n' +
      `     update public.profiles set rolle = 'admin' where epost = '${epost}';\n\n` +
      'Eller bruk Rediger-siden i appen hvis du allerede har innloggede admins.'
    )
  }

  // Profilen finnes — promoter til admin (idempotent re-kjøring etter delvis feil).
  console.log(`\n  Profilen ${epost} finnes allerede. Promoterer til admin ...\n`)
  const { error } = await adminClient
    .from('profiles')
    .update({ rolle: 'admin', ...(navnArg ? { navn: navnArg } : {}) })
    .eq('id', eksisterende.id)
  if (error) avbryt(`Klarte ikke promotere: ${error.message}`)
  console.log(`  OK — ${epost} er nå admin (id: ${eksisterende.id}).\n`)
  process.exit(0)
}

// ─── Lag 3: Retype-URL-prompt (bekreftelsessperre) ────────────────────────────
// Krever at brukeren skriver inn Supabase-URL-en på nytt. Enkelt, men effektivt
// mot tastatur-feil («jeg mente å trykke Ctrl+C, ikke Enter»).

const rl = readline.createInterface({ input, output })
console.log(`\n  Du er i ferd med å opprette første admin på:\n  ${SUPABASE_URL}\n`)
const bekreftet = await rl.question('  Skriv inn Supabase-URL-en på nytt for å bekrefte: ')
rl.close()

if (bekreftet.trim() !== SUPABASE_URL.trim()) {
  avbryt('URL-ene stemmer ikke. Ingen endringer gjort.')
}

// ─── Opprett bruker ──────────────────────────────────────────────────────────

const passord = genererPassord()

const { data: nyBruker, error: brukerfeil } = await adminClient.auth.admin.createUser({
  email: epost,
  password: passord,
  email_confirm: true,  // hopper over e-postbekreftelse for admin-oppsett
})

if (brukerfeil) avbryt(`Klarte ikke opprette bruker: ${brukerfeil.message}`)
const userId = nyBruker.user.id
console.log(`\n  Auth-bruker opprettet (id: ${userId}). Venter på profiles-trigger ...`)

// ─── Vent på profiles-trigger ────────────────────────────────────────────────
// handle_ny_bruker-triggeren (migrasjon 011) oppretter profiles-raden asynkront.
// Maks 5 sekunders polling (500 ms × 10 forsøk).

const funnet = await ventPaaProfil(adminClient, userId)
if (!funnet) {
  avbryt(
    'profiles-raden ble ikke opprettet innen 5 sek. ' +
    'Kjør manuelt:\n  UPDATE profiles SET rolle = \'admin\', navn = \'...\' WHERE id = \'' + userId + '\';'
  )
}

// ─── Promoter til admin + sett navn ──────────────────────────────────────────

const { error: oppdatertFeil } = await adminClient
  .from('profiles')
  .update({ rolle: 'admin', ...(navnArg ? { navn: navnArg } : {}) })
  .eq('id', userId)

if (oppdatertFeil) avbryt(`Klarte ikke sette rolle: ${oppdatertFeil.message}`)

// ─── Skriv passord til fil (IKKE til stdout) ──────────────────────────────────
// Passordet i stdout = shell-historikk-risiko. Vi skriver til fil med
// begrenset tilgang. fs.chmodSync er no-op på Windows — vi printer da en
// advarsel om å slette filen manuelt etter bruk.

const passordFil = './init-admin-passord.txt'
const filinnhold = [
  `Engangpassord for ${epost}`,
  `Supabase-instans: ${SUPABASE_URL}`,
  '',
  `Passord: ${passord}`,
  '',
  'Slett denne filen straks etter at du har logget inn og byttet passord!',
  '',
].join('\n')

// mode: 0o600 settes ved opprettelse for å lukke vinduet mellom write og chmod
// hvor en annen prosess kunne ha lest filen. På Windows er mode-flagget
// effektivt en no-op, men det er trygt å sende. chmodSync nedenfor er
// fallback i tilfelle umask eller eksisterende fil har endret tilgangen.
fs.writeFileSync(passordFil, filinnhold, { encoding: 'utf8', mode: 0o600 })

try {
  fs.chmodSync(passordFil, 0o600)
} catch {
  // Windows støtter ikke POSIX-tilganger — advarsel skrives nedenfor.
  console.warn(`  NB: Klarte ikke sette begrenset tilgang på ${passordFil} (Windows-begrensning).`)
  console.warn(`  Slett filen manuelt straks etter bruk.`)
}

// ─── Ferdig ──────────────────────────────────────────────────────────────────

console.log(`
  Admin opprettet:
    E-post : ${epost}
    Passord: se ${passordFil}
    Id     : ${userId}

  Neste steg:
    1. Logg inn på appen med e-post og passordet fra filen.
    2. Gå til Profil → Rediger og bytt passordet.
    3. Slett ${passordFil} (eller la det stå til neste restart — men ikke commit det!).
    4. Sett generalsekretær i appen: Rediger et annet medlem → toggle Generalsekretær.

  VIKTIG: Aldri commit ${passordFil} til git.
`)
