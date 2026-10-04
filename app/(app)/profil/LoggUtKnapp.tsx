'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoggUtKnapp() {
  const router = useRouter()
  const supabase = createClient()

  async function loggUt() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // Egen boks (samme form som SkjemaGruppe), én rad med rød tekst midtstilt.
  return (
    <div
      style={{
        borderRadius: 14,
        border: '0.5px solid var(--border)',
        background: 'var(--bg-elevated)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={loggUt}
        style={{
          display: 'block',
          width: '100%',
          minHeight: 48,
          background: 'transparent',
          border: 'none',
          color: 'var(--danger)',
          fontFamily: 'var(--font-body)',
          fontSize: 15,
          fontWeight: 500,
          textAlign: 'center',
        }}
      >
        Logg ut
      </button>
    </div>
  )
}
