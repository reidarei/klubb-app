// Hjelpere for å hente og parse GitHub-issues som klubbens «innspill».
// Filtrerer på `ønske`-label. Koblingen til avsenderen leses primært fra
// innspill_kobling (durabel, overlever redigering av issue-teksten, #632) —
// HTML-kommentaren i body er fallback for issues opprettet før migrasjon 136,
// eller hvis DB-oppslaget selv feiler. Parsingen bor i lib/innspill-kobling.ts
// slik at denne siden og webhooken aldri kan tolke samme markør ulikt.

import { githubIssuesUrl } from '@/lib/config'
import { createServerClient } from '@/lib/supabase/server'
import { parseProfilIdFraBody } from '@/lib/innspill-kobling'
import { logg } from '@/lib/logg'

const TOKEN = process.env.GITHUB_TOKEN

export type GitHubIssue = {
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  created_at: string
  closed_at: string | null
  html_url: string
  comments: number
  comments_url: string
}

export type Innspill = {
  nummer: number
  tittel: string
  innhold: string
  status: 'open' | 'closed'
  opprettet: string
  lukket: string | null
  profilId: string | null
  svar: string | null // Siste kommentar når lukket
  githubUrl: string
}

function githubHeaders(): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
  }
}

function ryddInnhold(body: string | null): string {
  if (!body) return ''
  return body
    .replace(/##\s*Ønske fra .+\n+/i, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()
}

async function hentSisteKommentar(issue: GitHubIssue): Promise<string | null> {
  if (issue.comments === 0) return null
  if (!TOKEN) return null
  const res = await fetch(
    `${issue.comments_url}?per_page=1&page=${issue.comments}`,
    { headers: githubHeaders(), next: { revalidate: 60 } },
  )
  if (!res.ok) return null
  const data = (await res.json()) as { body: string }[]
  return data[0]?.body?.trim() ?? null
}

// Henter alle ønske-issues (både åpne og lukkede). Filtreres på profilId hvis
// oppgitt — ellers returneres alt (brukes av admin).
export async function hentInnspill(profilId?: string): Promise<Innspill[]> {
  if (!TOKEN) return []

  const res = await fetch(
    githubIssuesUrl({ state: 'all' }),
    { headers: githubHeaders(), next: { revalidate: 60 } },
  )
  if (!res.ok) return []

  const issues = (await res.json()) as GitHubIssue[]
  // GitHub inkluderer pull requests i /issues — filtrer bort
  const kunIssues = issues.filter(i => !('pull_request' in i))

  const koblinger = await hentKoblinger()
  const finnProfilId = (i: GitHubIssue) => koblinger.get(i.number) ?? parseProfilIdFraBody(i.body)

  const filtrerte = profilId
    ? kunIssues.filter(i => finnProfilId(i) === profilId)
    : kunIssues

  // Hent siste kommentar for lukkede issues (parallelt)
  const medSvar = await Promise.all(
    filtrerte.map(async i => ({
      nummer: i.number,
      tittel: i.title,
      innhold: ryddInnhold(i.body),
      status: i.state,
      opprettet: i.created_at,
      lukket: i.closed_at,
      profilId: finnProfilId(i),
      svar: i.state === 'closed' ? await hentSisteKommentar(i) : null,
      githubUrl: i.html_url,
    })),
  )

  return medSvar
}

// Ett samlet oppslag mot innspill_kobling i stedet for ett per issue (#632).
// Fail-open: feiler spørringen, faller alle issues tilbake til
// body-markøren via finnProfilId() over — samme mønster som
// innspill.profiler.oppslag.feilet.
async function hentKoblinger(): Promise<Map<number, string>> {
  // Bruker-kontekst, ikke service_role: RLS-policyen på innspill_kobling
  // (`profil_id = auth.uid() or er_admin()`) gjør nøyaktig den filtreringen
  // denne siden trenger — et medlem ser sine egne rader, admin ser alle. Å
  // lese hele tabellen med service_role ville omgått vakten vi nettopp bygde.
  // Andres issues faller da til body-fallbacken og filtreres bort som før.
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('innspill_kobling')
    .select('issue_nummer, profil_id')

  if (error) {
    await logg.feil('innspill.koblinger.oppslag.feilet', error)
    return new Map()
  }

  return new Map((data ?? []).map(rad => [rad.issue_nummer, rad.profil_id]))
}
