// Pinner grensen #603 trakk: hvilke ressursfeil som får vekke en admin.
//
// Testen kaller den ekte klassifiseringsfunksjonen — ikke en kopi av regelen.
// Første utkast duplikatiserte if-en fra FeilFangst og ville derfor bestått
// uansett hva komponenten gjorde; klassifiseringen ble trukket ut i
// lib/klient-logg.ts nettopp for å kunne pinnes uten å montere React.

import { describe, it, expect } from 'vitest'
import { klassifiserRessursfeil } from '@/lib/klient-logg'
import { ALARM_IGNORERTE_EVENTS } from '@/lib/konstanter'

describe('klassifiserRessursfeil', () => {
  it('img → eget event på warn-nivå, så alarmen filtrerer det bort', () => {
    // Kosmetisk og på mobil oftest transient: dekningshull, bruker som blar
    // videre, iOS som suspenderer PWA-en. Én slik glipp på én telefon utløste
    // morgenalarmen på e-post fram til #603.
    expect(klassifiserRessursfeil('img')).toEqual({
      event: 'klient.bilde.feilet',
      nivaa: 'warn',
    })
  })

  it('script og link → error, alarmen skal fortsatt fyre (#575)', () => {
    // Uten disse mangler appen kode og er ødelagt. Dempes de, mister vi
    // nøyaktig det #575 ble bygget for å fange.
    for (const tag of ['script', 'link']) {
      expect(klassifiserRessursfeil(tag)).toEqual({
        event: 'klient.ressurs.feilet',
        nivaa: 'error',
      })
    }
  })

  it('er ufølsom for store bokstaver — tagName er versal i HTML-dokumenter', () => {
    // ev.target.tagName gir «IMG», ikke «img». Uten normalisering ville hvert
    // eneste bilde i produksjon blitt klassifisert som en kodefeil.
    expect(klassifiserRessursfeil('IMG').nivaa).toBe('warn')
    expect(klassifiserRessursfeil('SCRIPT').nivaa).toBe('error')
  })

  it('ukjente elementer regnes som alvorlige', () => {
    // Fail-closed: et element vi ikke har tatt stilling til skal heller
    // alarmere for mye enn å forsvinne stille.
    expect(klassifiserRessursfeil('iframe').nivaa).toBe('error')
  })
})

describe('dempingen skjer på nivå, ikke ved å ignorere event-navnet', () => {
  it('verken bilde- eller ressurs-eventet står i ALARM_IGNORERTE_EVENTS', () => {
    // Å ignorere navnet ville også skjult en ekte bildesvikt der ALLE bilder er
    // borte. Nivå-filteret (.neq('nivaa','warn')) fjerner støyen uten å gjøre
    // oss blinde for eventet.
    expect(ALARM_IGNORERTE_EVENTS).not.toContain('klient.bilde.feilet')
    expect(ALARM_IGNORERTE_EVENTS).not.toContain('klient.ressurs.feilet')
  })
})
