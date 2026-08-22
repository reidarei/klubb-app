import webpush from 'web-push'
import { VAPID_CONTACT_EMAIL } from '@/lib/config'
import { PUSH_TIMEOUT_MS } from '@/lib/konstanter'
import { logg } from '@/lib/logg'

let initialisert = false

function init() {
  if (initialisert) return
  if (!VAPID_CONTACT_EMAIL) {
    throw new Error(
      'VAPID_CONTACT_EMAIL mangler — push-varsler krever en kontakt-epost (se docs/klubb-tilpasning.md)'
    )
  }
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
  // Notifikasjons-gruppe (f.eks. «chat:klubb», «chat:albumbilde:{id}»).
  // Settes av kallstedet og sendes gjennom sendVarsel(s pushTag-parameter) —
  // ikke utledet her og ikke i sw.js (#612): tråd-identiteten finnes kun der
  // scopet er kjent. Samme tag ⇒ samme rad på låseskjermen (renotify: false
  // i sw.js) i stedet for én rad per melding i en burst.
  tag?: string
}

// Egen feil-klasse for timeout, ikke en generisk Error — gjør at catch-en
// under kan logge et distinkt event i stedet for å skylde på webpush selv.
class PushTimeoutError extends Error {
  constructor() {
    super(`Push tok mer enn ${PUSH_TIMEOUT_MS} ms`)
    this.name = 'PushTimeoutError'
  }
}

export async function sendPush(subscription: PushSubscription, payload: PushPayload) {
  init()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    // Hard timeout (#612): sendVarsel kjører alle mottakeres sendPush-kall i
    // ett Promise.all, og webpush.sendNotification har ingen egen deadline —
    // én hengende APNs/FCM-socket ville holdt HELE fanouten til Vercels
    // 10 s-funksjonsvegg.
    //
    // TO mekanismer, med vilje (#612-review):
    //  1. options.timeout river ned selve socketen (web-push setter
    //     https.request-timeout og destroy()-er requesten). Uten den lever
    //     forbindelsen videre mot APNs/FCM selv om vi har gitt opp å vente.
    //  2. Promise.race er fortsatt nødvendig fordi (1) er en INAKTIVITETS-
    //     timeout, ikke en hard frist: en treg motpart som sender en byte i
    //     ny og ne nullstiller den og kan dermed henge forbi 10 s-veggen.
    // Racet gir opp på DENNE ene mottakeren uten å blokkere resten.
    await Promise.race([
      webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(payload),
        { timeout: PUSH_TIMEOUT_MS }
      ),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new PushTimeoutError()), PUSH_TIMEOUT_MS)
      }),
    ])
  } catch (err: unknown) {
    if (err instanceof PushTimeoutError) {
      // Svelges som i dag (fail-open — se lib/varsler.ts filhode), men eget
      // event slik at en økende timeout-rate skiller seg fra ordinære
      // push-feil (410/ugyldig endpoint) i observability.
      await logg.feil('varsel.push.timeout', err)
      return
    }
    // 410 = subscription er utløpt/avmeldt, ignorer
    if ((err as { statusCode?: number }).statusCode !== 410) {
      await logg.feil('varsel.push.feilet', err)
    }
  } finally {
    // Rydd timeren uansett utfall — vinner sendNotification racet, ville en
    // utestående timer holdt event-loopen våken i opptil PUSH_TIMEOUT_MS.
    // Med opptil 17 mottakere per chat-melding er det 17 slike per melding.
    if (timer) clearTimeout(timer)
  }
}
