import IssuesListeKlient from './IssuesListeKlient'
import { githubIssuesUrl } from '@/lib/config'

export type GitHubIssue = {
  number: number
  title: string
  state: string
  created_at: string
  html_url: string
  labels: { name: string }[]
}

export async function hentAapneIssues(): Promise<GitHubIssue[]> {
  const token = process.env.GITHUB_TOKEN
  if (!token) return []

  const res = await fetch(
    githubIssuesUrl({ state: 'open', perPage: 50 }),
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
      next: { revalidate: 60 },
    }
  )

  if (!res.ok) return []
  return res.json()
}

export default async function IssuesListe({ aapne }: { aapne?: GitHubIssue[] }) {
  // Hvis foreldreren allerede har hentet listen, bruker vi den.
  // Ellers henter vi selv (bakoverkompatibel).
  const liste = aapne ?? (await hentAapneIssues())
  return <IssuesListeKlient aapne={liste} />
}
