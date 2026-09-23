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

  return (
    <button
      type="button"
      onClick={loggUt}
      style={{
        width: '100%',
        padding: '14px 0',
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 999,
        color: 'var(--danger)',
        fontFamily: 'var(--font-body)',
        fontSize: 14,
        fontWeight: 500,
        letterSpacing: '0.2px',
        cursor: 'pointer',
      }}
    >
      Logg ut
    </button>
  )
}
