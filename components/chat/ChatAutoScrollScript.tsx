/**
 * Inline script som scroller window til bunn FØR React hydrerer. Brukes
 * på chat-fokuserte sider (/chat, /samtaler/[id]) for å unngå flikket
 * der SSR-HTML tegnes med scroll på top, og deretter spretter til bunn
 * etter at useEffect kjører.
 *
 * Tilnærmingen er samme klassiske mønster som brukes for theme-toggle
 * (light/dark) for å unngå "flash of unstyled content". Synkront script
 * i body-en kjører før resten av siden er parsed/tegnet — så scroll-
 * posisjonen er på plass før første frame brukeren ser.
 *
 * Defense-in-depth: `Chat.tsx` har fortsatt en useEffect-fallback som
 * scroller til bunn ved mount. Hvis CSP eller annet hindrer dette
 * scriptet i å kjøre, faller vi tilbake til den gamle oppførselen.
 *
 * Se #209 (bug-fiks) og #210 (langsiktig intern-scroll-arkitektur).
 */
export default function ChatAutoScrollScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html:
          "try{window.scrollTo(0,document.documentElement.scrollHeight)}catch(e){}",
      }}
    />
  )
}
