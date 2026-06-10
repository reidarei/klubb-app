import webpush from 'web-push'
import { VAPID_CONTACT_EMAIL } from '@/lib/config'

let initialisert = false

function init() {
  if (initialisert) return
  webpush.setVapidDetails(
    `mailto:${VAPID_CONTACT_EMAIL}`,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
  initialisert = true
}

type PushSubscription = {
  endpoint: string
  p256dh: string
  auth: string
}

export type PushPayload = {
  tittel: string
  melding: string
  url?: string
}

export async function sendPush(subscription: PushSubscription, payload: PushPayload) {
  init()
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload)
    )
  } catch (err: unknown) {
    // 410 = subscription er utløpt/avmeldt, ignorer
    if ((err as { statusCode?: number }).statusCode !== 410) {
      console.error('Push feilet:', err)
    }
  }
}
