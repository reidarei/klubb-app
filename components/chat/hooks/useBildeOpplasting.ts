'use client'

import { useState, useEffect, useRef } from 'react'
import { komprimer } from '@/lib/bilde-utils'

// Vedheng-bilde for chat-input (file holdes til submit, lastes opp først ved
// send). Setterne eksponeres fordi handleSend i Chat.tsx manipulerer state
// direkte — blob-URL-livssyklusen ved send (bevisst ikke revoke ved suksess)
// eies av handleSend, ikke av denne hooken.
export function useBildeOpplasting() {
  const [bildeFil, setBildeFil] = useState<File | null>(null)
  const [bildePreview, setBildePreview] = useState<string | null>(null)
  const [bildeFeil, setBildeFeil] = useState('')
  const bildeInputRef = useRef<HTMLInputElement>(null)

  // Frigjør blob-URL når preview byttes
  useEffect(() => {
    return () => {
      if (bildePreview) URL.revokeObjectURL(bildePreview)
    }
  }, [bildePreview])

  async function velgBilde(e: React.ChangeEvent<HTMLInputElement>) {
    const fil = e.target.files?.[0]
    if (!fil) return
    setBildeFeil('')
    try {
      const komprimert = await komprimer(fil)
      setBildeFil(komprimert)
      if (bildePreview) URL.revokeObjectURL(bildePreview)
      setBildePreview(URL.createObjectURL(komprimert))
    } catch (err) {
      setBildeFeil(err instanceof Error ? err.message : 'Kunne ikke lese bildet')
    } finally {
      if (bildeInputRef.current) bildeInputRef.current.value = ''
    }
  }

  function fjernBilde() {
    setBildeFil(null)
    if (bildePreview) URL.revokeObjectURL(bildePreview)
    setBildePreview(null)
    setBildeFeil('')
  }

  return {
    bildeFil,
    setBildeFil,
    bildePreview,
    setBildePreview,
    bildeFeil,
    setBildeFeil,
    bildeInputRef,
    velgBilde,
    fjernBilde,
  }
}
