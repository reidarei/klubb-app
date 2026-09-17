'use client'

import { useState, useEffect } from 'react'

// To hooks, to spørsmål (#714 — se også CLAUDE.md § Policy: Skrivefelt og
// iOS-tastatur):
//
// - useKeyboardOffset(): «hvor mye må et VIEWPORT-FORANKRET element (fixed/
//   sticky/absolute) løftes for å stå over tastaturet?» Inkluderer
//   vv.offsetTop og lytter på vv.scroll i tillegg til vv.resize — nødvendig
//   fordi et forankret element må følge visual-viewportens bevegelser, og
//   derfor per design ustabil (bounce-quirk #222/#236). Kun for de tre
//   forbrukerne som faktisk forankrer til viewporten: PosisjonsKart sin
//   bunn-blokk (absolute i en fastlåst flate), BildeKommentarSheet, og
//   Chat sin !iEgenBoks-gren — altså /chat og /samtaler/[id], der chatten
//   ER siden og pillen er `position: fixed`. Den siste er ikke en rest
//   som skal ryddes bort, men det varig dokumenterte unntaket i policyen.
// - useTastaturHoyde(): «hvor høyt er tastaturet?» En ren trinnfunksjon av
//   av/på-tilstanden, uten offsetTop og uten scroll-lytter. Stabil, for
//   elementer som ligger I NORMAL FLYT (padding-bottom, ikke posisjon).
//
// De skal IKKE slås sammen — de svarer på forskjellige spørsmål, og et
// forsøk på å gjenbruke den ene til den andres formål er nøyaktig hvordan
// denne bug-klassen har kommet tilbake fire ganger (#222, #236, #712, #713).

// Tastatur-høyde via visualViewport. Begge hookene forutsetter
// 'resizes-visual'-oppførselen (default på iOS og Android, jf. app/layout.tsx):
// window.innerHeight står stille, mens visualViewport.height krymper når
// tastaturet åpner. Safari støtter aldri interactive-widget uansett verdi,
// men på Android Chromium slår 'overlays-content' krympingen helt av og
// 'resizes-content' krymper innerHeight i tillegg — begge nuller formelen
// under. Nøkkelen må derfor ALDRI settes til noe annet enn 'resizes-visual'.
// Se #731. Differansen er omtrent tastatur-høyden.
// keyboardOffset brukes KUN til layout: løfter input-pillen (sticky-pill
// bottom) og vokser paddingBottom på meldingslisten. Ingen scroll-side-
// effekter — terskel-basert auto-scroll fjernet fordi bounce-quirk (#222)
// på iOS PWA var ikke robust å skille fra ekte tastatur-åpning. Se #236.
export function useKeyboardOffset(): number {
  const [keyboardOffset, setKeyboardOffset] = useState(0)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return
    const vv = window.visualViewport
    function oppdater() {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setKeyboardOffset(offset)
    }
    vv.addEventListener('resize', oppdater)
    vv.addEventListener('scroll', oppdater)
    oppdater()
    return () => {
      vv.removeEventListener('resize', oppdater)
      vv.removeEventListener('scroll', oppdater)
    }
  }, [])
  return keyboardOffset
}

// Tastatur-høyde uten offsetTop og uten scroll-lytter — kun vv.resize.
// Svarer på «hvor høyt er tastaturet», ikke «hvor mye må jeg løfte noe».
// For elementer i normal flyt (padding-bottom + engangs-scroll ved focus),
// aldri for posisjonering. Se filhode-kommentaren over og #714.
export function useTastaturHoyde(): number {
  const [tastaturHoyde, setTastaturHoyde] = useState(0)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return
    const vv = window.visualViewport
    function oppdater() {
      setTastaturHoyde(Math.max(0, window.innerHeight - vv.height))
    }
    vv.addEventListener('resize', oppdater)
    oppdater()
    return () => {
      vv.removeEventListener('resize', oppdater)
    }
  }, [])
  return tastaturHoyde
}
