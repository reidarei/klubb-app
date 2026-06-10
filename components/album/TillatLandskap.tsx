'use client'

import { useEffect } from 'react'

// Setter `tillat-landskap`-klasse på <html> så portrett-overlayet i
// globals.css blir skjult. Brukes på album-sider hvor brukeren bør kunne
// snu telefonen for bedre bilde-visning.
export default function TillatLandskap() {
  useEffect(() => {
    document.documentElement.classList.add('tillat-landskap')
    return () => {
      document.documentElement.classList.remove('tillat-landskap')
    }
  }, [])
  return null
}
