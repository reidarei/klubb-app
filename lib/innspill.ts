// Hjelpere for å hente og parse GitHub-issues som herreklubbens «innspill».
// Filtrerer på `ønske`-label og plukker ut profil_id fra HTML-kommentar i
// issue-body (samme mønster som webhooken bruker).

import { githubIssuesUrl } from '@/lib/config'

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

function parseProfilId(body: string | null): string | null {
  if (!body) return null
  return body.match(/<!--\s*profil_id:([a-f0-9-]+)\s*-->/)?.[1] ?? null
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

  const filtrerte = profilId
    ? kunIssues.filter(i => parseProfilId(i.body) === profilId)
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
      profilId: parseProfilId(i.body),
      svar: i.state === 'closed' ? await hentSisteKommentar(i) : null,
      githubUrl: i.html_url,
    })),
  )

  return medSvar
}
