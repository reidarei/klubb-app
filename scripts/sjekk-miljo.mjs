// Validerer miljøvariabler for Herreklubben-appen.
// Sjekker format og tilstedeværelse, og rapporterer mangler per nivå.
//
// Kjøres: npm run sjekk-miljo  (alias for node --env-file=.env.local scripts/sjekk-miljo.mjs)
//
// Exit-kode 0 = OK (evt. advarsler), 1 = kritisk feil.

// ─── ANSI-farger (kun i TTY) ────────────────────────────────────────────────

const tty = process.stdout.isTTY
const r = (s) => tty ? `\x1b[31m${s}\x1b[0m` : s   // rød
const g = (s) => tty ? `\x1b[32m${s}\x1b[0m` : s   // grønn
const y = (s) => tty ? `\x1b[33m${s}\x1b[0m` : s   // gul
const b = (s) => tty ? `\x1b[1m${s}\x1b[0m` : s    // fet

// ─── TYPVALIDATORER ──────────────────────────────────────────────────────────

// Hjelper: legacy Supabase-nøkkel er en JWT (eyJ + 3 deler).
const erLegacyJwt = (v) => {
  const deler = v.split('.')
  return deler.length === 3 && deler[0].startsWith('eyJ')
}

// Hjelper: les `role`-claimen ut av en legacy Supabase-JWT.
// Returnerer strengen ved suksess, eller null hvis payloaden ikke kan dekodes.
// Vi printer ALDRI verdier herfra — kun navn på variabelen som ev. er byttet.
const lesJwtRole = (v) => {
  try {
    const payload = JSON.parse(
      Buffer.from(v.split('.')[1], 'base64url').toString('utf8'),
    )
    return typeof payload?.role === 'string' ? payload.role : null
  } catch {
    return null
  }
}

const typer = {
  // Gyldig URL med https eller http
  url: (v) => {
    try { const u = new URL(v); return u.protocol === 'https:' || u.protocol === 'http:' }
    catch { return false }
  },
  // Supabase publishable/anon-nøkkel.
  // To formatgenerasjoner finnes side om side:
  //   - Ny (fra ~2025): "sb_publishable_<base64>" — opaque token, ikke JWT.
  //   - Legacy: signert JWT (eyJ...). Eksisterende prosjekter har fortsatt denne.
  // Vi godtar begge — gamle prosjekter trenger ikke roteres. For legacy JWT
  // sjekker vi at role-claimen i payloaden er 'anon' så vi fanger nøkkelbytte
  // (service_role lagt i anon-variabelen) — men aksepterer udekodbar payload
  // for å ikke være strengere enn nødvendig mot ukjente legacy-varianter.
  'supabase-publishable': (v) => {
    if (v.startsWith('sb_publishable_')) return true
    if (!erLegacyJwt(v)) return false
    const role = lesJwtRole(v)
    return role === null || role === 'anon'
  },
  // Supabase secret/service-role-nøkkel.
  //   - Ny: "sb_secret_<base64>" — opaque token.
  //   - Legacy: JWT med role: service_role i payload. Vi sjekker claimen for
  //     å fange byttede nøkler (anon-JWT lagt inn som service-role).
  'supabase-secret': (v) => {
    if (v.startsWith('sb_secret_')) return true
    if (!erLegacyJwt(v)) return false
    const role = lesJwtRole(v)
    return role === null || role === 'service_role'
  },
  // VAPID offentlig nøkkel: ukomprimert P-256 punkt → 65 bytes → 87 base64url-tegn
  // (uten padding). Bruker 80–100 for slingring rundt eventuelle implementasjoner
  // som padder eller hopper et tegn.
  'vapid-public': (v) => /^[A-Za-z0-9_-]{80,100}$/.test(v),
  // VAPID privat nøkkel: en P-256 skalar → 32 bytes → 43 base64url-tegn (44 med padding).
  'vapid-private': (v) => /^[A-Za-z0-9_-]{43,44}$/.test(v),
  // E-postadresse
  epost: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
  // Hostnavn (domene uten protokoll)
  hostname: (v) => /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(v),
  // GitHub-token med kjente prefikser
  'github-token': (v) => v.startsWith('ghp_') || v.startsWith('github_pat_') || v.startsWith('gho_'),
  // Resend API-nøkkel
  'resend-key': (v) => v.startsWith('re_'),
  // R2 jurisdiksjon — speiler verdiene lib/r2.ts faktisk forventer.
  // 'default' gir tomt segment i endpointet, 'eu' gir '.eu'-segment,
  // 'fedramp' gir '.fedramp'-segment (Cloudflares US-myndighetstilbud).
  'r2-jurisdiction': (v) => ['default', 'eu', 'fedramp'].includes(v.toLowerCase()),
  // Ikke-tom streng
  streng: (v) => v.trim().length > 0,
  // Positivt heltall
  'pos-int': (v) => /^\d+$/.test(v) && parseInt(v, 10) > 0,
  // Måned 1–12
  maaned: (v) => /^\d+$/.test(v) && parseInt(v, 10) >= 1 && parseInt(v, 10) <= 12,
  // Dag 1–31 (vi sjekker ikke at dag faktisk finnes i måneden — overkill her)
  dag: (v) => /^\d+$/.test(v) && parseInt(v, 10) >= 1 && parseInt(v, 10) <= 31,
}

function valider(type, verdi) {
  const fn = typer[type]
  if (!fn) return true // ukjent type = ingen formatsjekk
  return fn(verdi)
}

// ─── VARIABELDEFINISJON ──────────────────────────────────────────────────────
//
// nivaa: 'kritisk' → ✖ + exit 1 ved feil/mangler
//        'anbefalt' → ⚠ ved mangler, ✖ ved satt-men-feil-format
//        'valgfri'  → ✓ kun hvis satt, ellers stille

const variabler = [
  // Supabase
  { navn: 'NEXT_PUBLIC_SUPABASE_URL',   nivaa: 'kritisk',   type: 'url',      beskrivelse: 'Supabase prosjekt-URL' },
  { navn: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', nivaa: 'kritisk', type: 'supabase-publishable', beskrivelse: 'Supabase anon/publishable-nøkkel (sb_publishable_... eller legacy JWT)' },
  { navn: 'SUPABASE_SERVICE_ROLE_KEY',  nivaa: 'kritisk',   type: 'supabase-secret', beskrivelse: 'Supabase service-role-nøkkel (sb_secret_... eller legacy JWT, SECRET)' },

  // R2
  { navn: 'R2_ACCOUNT_ID',             nivaa: 'kritisk',   type: 'streng',   beskrivelse: 'Cloudflare konto-ID' },
  { navn: 'R2_ACCESS_KEY_ID',          nivaa: 'kritisk',   type: 'streng',   beskrivelse: 'R2 access key ID (SECRET)' },
  { navn: 'R2_SECRET_ACCESS_KEY',      nivaa: 'kritisk',   type: 'streng',   beskrivelse: 'R2 secret access key (SECRET)' },
  { navn: 'R2_BUCKET',                 nivaa: 'valgfri',   type: 'streng',   beskrivelse: 'R2 bucket-navn (default: herreklubben-bilder)' },
  { navn: 'R2_JURISDICTION',           nivaa: 'valgfri',   type: 'r2-jurisdiction', beskrivelse: 'R2 jurisdiksjon: default|eu|fedramp' },
  // R2_PUBLIC_URL og NEXT_PUBLIC_R2_PUBLIC_URL håndteres som spesialsjekk under

  // VAPID
  { navn: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', nivaa: 'kritisk', type: 'vapid-public',  beskrivelse: 'VAPID offentlig nøkkel (base64url, ~87 tegn)' },
  { navn: 'VAPID_PRIVATE_KEY',          nivaa: 'kritisk',   type: 'vapid-private', beskrivelse: 'VAPID privat nøkkel (base64url, 43–44 tegn, SECRET)' },
  // Anbefalt fordi defaulten i lib/config.ts er kildeklubbens egen kontakt-epost.
  // Ved fork: push-tjenester (Apple/Google) skal kunne nå klubbens egen kontakt,
  // ikke en annens. Vi skriker ⚠ men blokkerer ikke.
  { navn: 'VAPID_CONTACT_EMAIL',        nivaa: 'anbefalt',  type: 'epost',    beskrivelse: 'Kontakt-epost for push-tjenester — bør settes per klubb (default er kildeklubbens kontakt)' },

  // Resend
  { navn: 'RESEND_API_KEY',            nivaa: 'anbefalt',  type: 'resend-key', beskrivelse: 'Resend API-nøkkel (re_...) — e-postvarsler mangler uten' },
  { navn: 'RESEND_FROM',               nivaa: 'valgfri',   type: 'streng',   beskrivelse: 'Avsendernavn i utgående e-post' },

  // Cron
  { navn: 'CRON_SECRET',               nivaa: 'anbefalt',  type: 'streng',   beskrivelse: 'Delt hemmelighet for cron-endepunkt — påminnelsesvarsler mangler uten' },

  // GitHub
  { navn: 'GITHUB_TOKEN',              nivaa: 'anbefalt',  type: 'github-token', beskrivelse: 'GitHub PAT (ghp_/github_pat_) — innspill-funksjon + bli-utvikler-endepunktet (/api/bli-utvikler) feiler uten' },
  { navn: 'GITHUB_WEBHOOK_SECRET',     nivaa: 'anbefalt',  type: 'streng',   beskrivelse: 'GitHub webhook-hemmelighet — innkommende webhook-validering mangler uten' },
  { navn: 'NEXT_PUBLIC_GITHUB_REPO',   nivaa: 'valgfri',   type: 'streng',   beskrivelse: 'GitHub-repo for innspill (default: reidarei/Herreklubben)' },
  { navn: 'NEXT_PUBLIC_GITHUB_ONSKE_LABEL', nivaa: 'valgfri', type: 'streng', beskrivelse: 'GitHub Issues-label for ønsker (default: ønske)' },

  // Base-URL
  { navn: 'NEXT_PUBLIC_BASE_URL',      nivaa: 'valgfri',   type: 'url',      beskrivelse: 'Base-URL override (trengs normalt ikke — utledes fra KLUBB_DOMENE/VERCEL_URL)' },

  // Klubbidentitet
  { navn: 'NEXT_PUBLIC_KLUBB_NAVN',              nivaa: 'valgfri', type: 'streng', beskrivelse: 'Klubbnavn (default: Mortensrud Herreklubb)' },
  { navn: 'NEXT_PUBLIC_KLUBB_KORTNAVN',          nivaa: 'valgfri', type: 'streng', beskrivelse: 'Kortnavn (default: Herreklubben)' },
  { navn: 'NEXT_PUBLIC_KLUBB_NAVN_LINJE_1',      nivaa: 'valgfri', type: 'streng', beskrivelse: 'Visningsnavn linje 1' },
  { navn: 'NEXT_PUBLIC_KLUBB_NAVN_LINJE_2',      nivaa: 'valgfri', type: 'streng', beskrivelse: 'Visningsnavn linje 2' },
  { navn: 'NEXT_PUBLIC_KLUBB_BESKRIVELSE',       nivaa: 'valgfri', type: 'streng', beskrivelse: 'Beskrivelse av appen' },
  { navn: 'NEXT_PUBLIC_KLUBB_DOMENE',            nivaa: 'valgfri', type: 'hostname', beskrivelse: 'Domenenavn (default: mortensrudherreklubb.no)' },
  { navn: 'NEXT_PUBLIC_KLUBB_STIFTET_AAR',       nivaa: 'valgfri', type: 'pos-int', beskrivelse: 'Stiftelsesår' },
  { navn: 'NEXT_PUBLIC_KLUBB_STIFTET_MAANED',    nivaa: 'valgfri', type: 'maaned',  beskrivelse: 'Stiftelsesmåned (1–12)' },
  { navn: 'NEXT_PUBLIC_KLUBB_STIFTET_DAG',       nivaa: 'valgfri', type: 'dag',     beskrivelse: 'Stiftelsesdag (1–31)' },
  { navn: 'NEXT_PUBLIC_KLUBB_STED',              nivaa: 'valgfri', type: 'streng', beskrivelse: 'Sted/bydel' },
  { navn: 'NEXT_PUBLIC_ROLLE_TITTEL_GENERALSEKRETAER', nivaa: 'valgfri', type: 'streng', beskrivelse: 'Tittel for generalsekretær-rollen' },
  { navn: 'NEXT_PUBLIC_R2_CUSTOM_DOMAIN',        nivaa: 'valgfri', type: 'hostname', beskrivelse: 'Custom domain for R2-bilder (kun ved eget domene)' },

  // Dev-only
  { navn: 'ALLOW_LOCAL_NOTIFICATIONS',  nivaa: 'valgfri', type: 'streng', beskrivelse: 'Aktiver ekte varsler i dev (sett true)' },
]

// ─── INNSAMLING OG SJEKK ─────────────────────────────────────────────────────

let kritiskFeil = 0
let advarsler = 0
const meldinger = { kritisk: [], anbefalt: [], valgfri: [] }

for (const { navn, nivaa, type, beskrivelse } of variabler) {
  const verdi = process.env[navn]
  const satt = verdi !== undefined && verdi !== ''

  if (nivaa === 'valgfri') {
    if (satt) {
      const ok = valider(type, verdi)
      if (ok) {
        meldinger.valgfri.push(`  ${g('✓')} ${navn}`)
      } else {
        // Satt, men feil format — alltid feil uansett nivå
        meldinger.valgfri.push(`  ${r('✖')} ${navn} — satt, men ugyldig format (${type})`)
        kritiskFeil++
      }
    }
    // Ikke satt og valgfri → stille
    continue
  }

  if (!satt) {
    if (nivaa === 'kritisk') {
      meldinger.kritisk.push(`  ${r('✖')} ${navn} — mangler  (${beskrivelse})`)
      kritiskFeil++
    } else {
      meldinger.anbefalt.push(`  ${y('⚠')} ${navn} — ikke satt  (${beskrivelse})`)
      advarsler++
    }
    continue
  }

  // Satt — formatkontroll
  const ok = valider(type, verdi)
  if (!ok) {
    // Skill mellom rent formatfeil og legacy-JWT med feil role-claim.
    // Sistnevnte er en sterk indikator på at nøklene er byttet om mellom
    // anon- og service-role-variabelen — vanlig feil ved kopiering.
    let melding = `ugyldig format (forventet: ${type})`
    if ((type === 'supabase-publishable' || type === 'supabase-secret') && erLegacyJwt(verdi)) {
      const role = lesJwtRole(verdi)
      const forventetRole = type === 'supabase-secret' ? 'service_role' : 'anon'
      if (role && role !== forventetRole) {
        melding = `legacy JWT med role='${role}', forventet '${forventetRole}' — sannsynlig nøkkel-bytte mellom anon og service-role`
      }
    }
    // Satt, men feil format — alltid kritisk feil
    const linje = `  ${r('✖')} ${navn} — ${melding}  (${beskrivelse})`
    if (nivaa === 'kritisk') {
      meldinger.kritisk.push(linje)
    } else {
      meldinger.anbefalt.push(linje)
    }
    kritiskFeil++
    continue
  }

  if (nivaa === 'kritisk') {
    meldinger.kritisk.push(`  ${g('✓')} ${navn}`)
  } else {
    meldinger.anbefalt.push(`  ${g('✓')} ${navn}`)
  }
}

// ─── SPESIALSJEKK 1: R2 public URL ──────────────────────────────────────────
// Minst én av R2_PUBLIC_URL eller NEXT_PUBLIC_R2_PUBLIC_URL må være satt.
// Vi rapporterer som én linje for å unngå støy når begge er satt til samme verdi.

const r2PubServer = process.env.R2_PUBLIC_URL
const r2PubKlient = process.env.NEXT_PUBLIC_R2_PUBLIC_URL
const r2ServerSatt = r2PubServer && r2PubServer !== ''
const r2KlientSatt = r2PubKlient && r2PubKlient !== ''

if (!r2ServerSatt && !r2KlientSatt) {
  meldinger.kritisk.push(`  ${r('✖')} R2_PUBLIC_URL / NEXT_PUBLIC_R2_PUBLIC_URL — minst én må settes (bilder kan ikke vises uten)`)
  kritiskFeil++
} else {
  // Valider format på de som er satt
  const serverOk = !r2ServerSatt || typer.url(r2PubServer)
  const klientOk = !r2KlientSatt || typer.url(r2PubKlient)

  if (!serverOk) {
    meldinger.kritisk.push(`  ${r('✖')} R2_PUBLIC_URL — ugyldig URL-format`)
    kritiskFeil++
  }
  if (!klientOk) {
    meldinger.kritisk.push(`  ${r('✖')} NEXT_PUBLIC_R2_PUBLIC_URL — ugyldig URL-format`)
    kritiskFeil++
  }
  if (serverOk && klientOk) {
    // Beskriv hvilken som faktisk er satt — gir nyttig synlighet uten å printe verdier.
    const navn = r2ServerSatt && r2KlientSatt
      ? 'R2_PUBLIC_URL + NEXT_PUBLIC_R2_PUBLIC_URL (begge satt)'
      : r2ServerSatt ? 'R2_PUBLIC_URL' : 'NEXT_PUBLIC_R2_PUBLIC_URL'
    meldinger.kritisk.push(`  ${g('✓')} R2 public URL (${navn})`)
  }
}

// ─── SPESIALSJEKK 2: BASE_URL vs KLUBB_DOMENE drift ─────────────────────────
// Hvis begge er satt og BASE_URL ikke stemmer med KLUBB_DOMENE, er det
// to sannhetskilder som kan gi forskjellige URL-er i varsler og ICS.

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
const klubbDomene = process.env.NEXT_PUBLIC_KLUBB_DOMENE
if (baseUrl && baseUrl !== '' && klubbDomene && klubbDomene !== '') {
  const forventet = `https://${klubbDomene}`
  if (baseUrl !== forventet) {
    meldinger.anbefalt.push(
      `  ${y('⚠')} NEXT_PUBLIC_BASE_URL (${baseUrl}) stemmer ikke med NEXT_PUBLIC_KLUBB_DOMENE (${forventet}) — mulig drift mellom to sannhetskilder`
    )
    advarsler++
  }
}

// ─── SPESIALSJEKK 3: Secret-lekkasje i NEXT_PUBLIC_ ─────────────────────────
// Heuristikk: hvis verdien til en NEXT_PUBLIC_-variabel ligner et kjent
// secret-format, er det sannsynligvis en feilkonfigurasjon.
// VIKTIG: vi printer ALDRI verdien — kun variabelnavnet.

for (const [key, val] of Object.entries(process.env)) {
  if (!key.startsWith('NEXT_PUBLIC_') || !val) continue

  let lekkasje = false

  // Kjente token-prefikser — inkluderer både Supabase ny-format (sb_secret_)
  // og GitHub/Resend.
  if (
    val.startsWith('ghp_') ||
    val.startsWith('github_pat_') ||
    val.startsWith('re_') ||
    val.startsWith('sb_secret_')
  ) {
    lekkasje = true
  }

  // Legacy Supabase JWT med service_role i payload
  // (base64-dekod midtdel, let etter "role":"service_role")
  if (!lekkasje && val.split('.').length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(val.split('.')[1], 'base64url').toString('utf8'))
      if (payload?.role === 'service_role') lekkasje = true
    } catch { /* ugyldig base64 eller JSON — ikke en JWT */ }
  }

  if (lekkasje) {
    meldinger.kritisk.push(
      `  ${r('✖')} ${key} — verdien ser ut som et secret (token/nøkkel) og skal IKKE ha NEXT_PUBLIC_-prefiks (inlines i browser-bundle)`
    )
    kritiskFeil++
  }
}

// ─── UTSKRIFT ────────────────────────────────────────────────────────────────

console.log('')
console.log(b('=== Herreklubben — miljøsjekk ==='))
console.log('')

if (meldinger.kritisk.length > 0) {
  console.log(b('Kritiske (app starter ikke uten):'))
  meldinger.kritisk.forEach((m) => console.log(m))
  console.log('')
}

if (meldinger.anbefalt.length > 0) {
  console.log(b('Anbefalte (mangler gir redusert funksjonalitet):'))
  meldinger.anbefalt.forEach((m) => console.log(m))
  console.log('')
}

if (meldinger.valgfri.length > 0) {
  console.log(b('Valgfrie (satt, med defaults):'))
  meldinger.valgfri.forEach((m) => console.log(m))
  console.log('')
}

// Oppsummering
const kritiskOk = meldinger.kritisk.filter((m) => m.includes('✓')).length
const anbefaltOk = meldinger.anbefalt.filter((m) => m.includes('✓')).length

if (kritiskFeil === 0 && advarsler === 0) {
  console.log(g(`✓ Alt OK — ${kritiskOk} kritiske og ${anbefaltOk} anbefalte variabler er satt og gyldige.`))
} else if (kritiskFeil === 0) {
  console.log(y(`⚠ ${advarsler} advarsel(er) — ${kritiskOk} kritiske OK. Appen starter, men noen funksjoner mangler.`))
} else {
  console.log(r(`✖ ${kritiskFeil} kritisk feil — ${advarsler} advarsel(er). Fiks feil markert med ✖ før deploy.`))
}
console.log('')

process.exit(kritiskFeil > 0 ? 1 : 0)
