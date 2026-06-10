import type { MetadataRoute } from 'next'
import { KLUBB_NAVN, KLUBB_KORTNAVN, KLUBB_BESKRIVELSE } from '@/lib/klubb-config'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: KLUBB_NAVN,
    short_name: KLUBB_KORTNAVN,
    description: KLUBB_BESKRIVELSE,
    start_url: '/',
    display: 'standalone',
    background_color: '#060608',
    theme_color: '#060608',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any' as 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any' as 'any',
      },
      {
        src: '/icon-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable' as 'maskable',
      },
      {
        src: '/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable' as 'maskable',
      },
    ],
  }
}
