'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PilleKnapp } from '@/components/ui/TreffPille'

// Samme utlogging som LoggUtKnapp på /profil, men som pille (jf. CLAUDE.md § Policy: Trykkflater).
export default function IkkeMedGjengenLoggUt() {
  const router = useRouter()
  const supabase = createClient()

  async function loggUt() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <PilleKnapp
      onClick={loggUt}
      synligHoyde={40}
      pilleStil={{
        padding: '10px 22px',
        borderRadius: 999,
        border: '0.5px solid var(--border)',
        background: 'var(--bg-elevated)',
        color: 'var(--danger)',
        fontFamily: 'var(--font-body)',
        fontSize: 15,
        fontWeight: 500,
      }}
    >
      Logg ut
    </PilleKnapp>
  )
}
