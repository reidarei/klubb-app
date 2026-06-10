import { Suspense } from 'react'
import TopHeader from '@/components/TopHeader'
import PageTransition from '@/components/PageTransition'
import ServiceWorkerRegistrering from '@/components/ServiceWorkerRegistrering'
import DraNedForOppdater from '@/components/DraNedForOppdater'
import DeployInfo from '@/components/DeployInfo'
import InstallVeiledning from '@/components/InstallVeiledning'
import { getInnloggetBruker, getProfil } from '@/lib/auth-cache'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { harUlestChat, harUlestVarsler } from '@/lib/ulest'

async function HeaderMedProfil() {
  const profil = await getProfil()
  const user = await getInnloggetBruker() // cachet via React cache()
  // Ulest-prikkene er nice-to-have. Vi sluker feil fra ulest-spørringene så en
  // forbigående DB-feil aldri kræsjer headeren — verste utfall er at prikken
  // ikke vises et øyeblikk. De to spørringene kjøres parallelt for å unngå
  // serielle DB-runder.
  const supabase = await createServerClient()
  const [ulestChat, ulestVarsler] = user
    ? await Promise.all([
        harUlestChat(supabase, user.id, profil?.chat_sist_sett ?? null).catch(() => false),
        harUlestVarsler(supabase, user.id).catch(() => false),
      ])
    : [false, false]

  return (
    <TopHeader
      brukerNavn={profil?.navn}
      bildeUrl={profil?.bilde_url ?? null}
      rolle={profil?.rolle ?? null}
      ulestChat={ulestChat}
      ulestVarsler={ulestVarsler}
    />
  )
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getInnloggetBruker()
  if (!user) redirect('/login')

  return (
    <div
      className="flex flex-col min-h-screen relative"
      style={{
        maxWidth: 480,
        margin: '0 auto',
        boxShadow: '0 0 0 0.5px var(--border-subtle)',
      }}
    >
      <ServiceWorkerRegistrering />
      <DraNedForOppdater />
      <InstallVeiledning />
      <Suspense fallback={<TopHeader />}>
        <HeaderMedProfil />
      </Suspense>
      <main className="flex-1 relative z-10">
        <PageTransition>{children}</PageTransition>
        <DeployInfo />
      </main>
    </div>
  )
}
