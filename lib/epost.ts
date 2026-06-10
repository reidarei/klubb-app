// Krever verifisert domene i Resend — sett RESEND_FROM til f.eks. "Herreklubben <noreply@dittdomene.no>"
import { KLUBB_NAVN } from './klubb-config'
const RESEND_API_KEY = process.env.RESEND_API_KEY!
// Avsender er server-only-konfig (Resend-spesifikk) og holdes derfor her,
// ikke i klient-trygg klubb-config. Ingen NEXT_PUBLIC_-prefiks.
const RESEND_FROM = process.env.RESEND_FROM ?? 'Herreklubben <onboarding@resend.dev>'

export async function sendEpost({ til, emne, html }: { til: string; emne: string; html: string }) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: RESEND_FROM, to: til, subject: emne, html }),
    })
    if (!res.ok) {
      console.error('Epost feilet:', await res.text())
    }
  } catch (err) {
    console.error('Epost-feil:', err)
  }
}

// Nøytral gull-aksent som gir gjenkjennelig Herreklubb-preg i begge moduser.
// Ellers er malen helt upåvirket av dark/light — klientene inverterer lys-mal
// automatisk for brukere med dark mode (Apple Mail, Gmail, Outlook).
const AKSENT = '#d4a853'

// Escaper brukerinput før den interpoleres i HTML. Sentral i e-postmalene
// så vi ikke risikerer at en hilsen som «<a href=…>klikk</a>» rendres som
// HTML i innboksen. Push- og in-app-varsler bruker ren tekst og trenger
// ikke escaping — derfor gjøres dette her, ikke i sendVarsel.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function arrangementEpostHtml({
  tittel,
  tekst,
  url,
  knappTekst,
}: {
  tittel: string
  tekst: string
  url: string
  knappTekst: string
}) {
  // Tittel, tekst og knappetekst kan inneholde brukerinput (f.eks. hilsen i
  // purring) — escapes her. URL-en konstrueres alltid av oss fra trygge kilder
  // (BASE_URL + varsel-id), men vi escaper attribute-konteksten for sikkerhets skyld.
  const tittelEsc = escapeHtml(tittel)
  const tekstEsc = escapeHtml(tekst)
  const urlEsc = escapeHtml(url)
  const knappTekstEsc = escapeHtml(knappTekst)
  // KLUBB_NAVN kommer fra env-var (NEXT_PUBLIC_KLUBB_NAVN) — escapes som
  // forsvar i dybden selv om kilden i praksis kontrolleres av deployer.
  return `
<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:32px 0;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
        <tr><td style="padding:32px;">
          <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;">${escapeHtml(KLUBB_NAVN)}</p>
          <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;">${tittelEsc}</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;white-space:pre-wrap;">${tekstEsc}</p>
          <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:separate;">
            <tr><td bgcolor="${AKSENT}" style="background:${AKSENT};border-radius:8px;">
              <a href="${urlEsc}" style="display:inline-block;padding:12px 24px;color:#0a0a0a;text-decoration:none;font-weight:600;font-size:14px;">${knappTekstEsc}</a>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export function velkommenEpostHtml({
  navn,
  epost,
  passord,
  loggInnUrl,
}: {
  navn: string
  epost: string
  passord: string
  loggInnUrl: string
}) {
  const deler = navn.trim().split(/\s+/)
  const etternavn = deler.length > 1 ? deler[deler.length - 1] : deler[0]
  // Navn settes av admin og er lavrisiko, men vi escaper konsekvent slik at
  // en bokstavelig «<» i navnet ikke ender opp som markup.
  const etternavnEsc = escapeHtml(etternavn)
  const epostEsc = escapeHtml(epost)
  const passordEsc = escapeHtml(passord)
  const loggInnUrlEsc = escapeHtml(loggInnUrl)
  return `
<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding:32px 0;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
        <tr><td style="padding:32px;">
          <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;">${escapeHtml(KLUBB_NAVN)}</p>
          <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;">Velkommen herr ${etternavnEsc}!</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;">Du er lagt til som medlem i ${escapeHtml(KLUBB_NAVN)}. Under finner du innloggingsinfoen din.</p>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
            <tr><td style="padding:6px 0;">
              <p style="margin:0 0 2px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.7;">Brukernavn</p>
              <p style="margin:0;font-size:14px;font-family:Menlo,Consolas,monospace;word-break:break-all;">${epostEsc}</p>
            </td></tr>
            <tr><td style="padding:6px 0;">
              <p style="margin:0 0 2px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.7;">Midlertidig passord</p>
              <p style="margin:0;font-size:14px;font-family:Menlo,Consolas,monospace;font-weight:700;">${passordEsc}</p>
            </td></tr>
          </table>
          <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:separate;">
            <tr><td bgcolor="${AKSENT}" style="background:${AKSENT};border-radius:8px;">
              <a href="${loggInnUrlEsc}" style="display:inline-block;padding:12px 24px;color:#0a0a0a;text-decoration:none;font-weight:600;font-size:14px;">Logg inn</a>
            </td></tr>
          </table>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;opacity:0.7;">Når du er logget inn kan du sette ditt eget passord under <strong>Profil</strong>. Installer gjerne appen på mobilen via «Legg til på Hjem-skjerm».</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
