import { describe, it, expect } from 'vitest'
import {
  nesteFeiringsdato,
  byggBursdagsprompt,
  statusForFeilklasse,
  tellerSomFeil,
} from '@/lib/bursdagsbilde'
import type { VertexFeilKlasse } from '@/lib/vertex'
import { BURSDAGSBILDE_PROMPT_BASIS } from '@/lib/klubb-prompt'
import { STIKKORD_MAKS_LENGDE } from '@/lib/konstanter'

describe('nesteFeiringsdato', () => {
  it('en bursdag senere i året gir årets dato', () => {
    expect(nesteFeiringsdato('1980-09-10', '2026-09-04')).toBe('2026-09-10')
  })

  it('bursdagsdagen selv teller som neste', () => {
    expect(nesteFeiringsdato('1980-09-10', '2026-09-10')).toBe('2026-09-10')
  })

  it('en passert bursdag ruller til neste år', () => {
    expect(nesteFeiringsdato('1980-03-02', '2026-09-04')).toBe('2027-03-02')
  })

  // Kjernen i BLOCKER-funnet: uten skuddårsregelen ble strengen «2027-02-29»
  // bygget — en dato som ikke finnes, som Postgres avviser på en `date`-
  // parameter, og som uansett aldri hadde truffet raden cron skriver 1. mars.
  it('29. februar feires 1. mars i et ikke-skuddår', () => {
    expect(nesteFeiringsdato('1984-02-29', '2027-01-10')).toBe('2027-03-01')
  })

  it('29. februar beholdes i et skuddår', () => {
    expect(nesteFeiringsdato('1984-02-29', '2028-01-10')).toBe('2028-02-29')
  })

  it('29. februar ruller til neste år etter at 1. mars er passert', () => {
    expect(nesteFeiringsdato('1984-02-29', '2027-06-01')).toBe('2028-02-29')
  })

  // Invariant cron hviler på: for en mann finnBursdagsbarn() returnerer på
  // dato D, MÅ neste feiringsdato være nøyaktig D — ellers ville cron skrevet
  // raden sin på en annen nøkkel enn den agendakortet og admin leser.
  it('gir passdatoen tilbake for en 29. februar-mann på 1. mars', () => {
    expect(nesteFeiringsdato('1984-02-29', '2027-03-01')).toBe('2027-03-01')
  })
})

describe('byggBursdagsprompt', () => {
  it('inneholder navn og alder', () => {
    const prompt = byggBursdagsprompt({ navn: 'Ola Testesen', alder: 45, stikkord: '' })
    expect(prompt).toContain('Ola Testesen')
    expect(prompt).toContain('45')
  })

  it('tomt stikkordfelt gir ingen stikkord-setning og ingen fallback-tekst', () => {
    const prompt = byggBursdagsprompt({ navn: 'Ola', alder: 30, stikkord: '' })
    expect(prompt.toLowerCase()).not.toContain('personal traits')
    expect(prompt.toLowerCase()).not.toContain('weave in')
  })

  // Basis-scenen skal gjelde ALLE, også en mann uten stikkord — det er hele
  // poenget med at den er basis og ikke noe admin må fylle ut per mann.
  //
  // Assert mot KONSTANTEN, aldri mot en frase fra den: teksten er
  // klubbconfig (lib/klubb-prompt.ts) og kan settes per instans via env.
  // En test som sjekker etter en bestemt formulering går i stykker så snart
  // en klubb endrer scenen sin — og den fanger ikke det den skal uansett.
  // Invarianten er at basis kommer først og komplett, ikke hva den sier.
  it('basis-scenen er med i sin helhet uansett om stikkord finnes', () => {
    const forventet = BURSDAGSBILDE_PROMPT_BASIS.split('{navn}')
      .join('Ola')
      .split('{alder}')
      .join('50')
    for (const stikkord of ['', 'fisking']) {
      const prompt = byggBursdagsprompt({ navn: 'Ola', alder: 50, stikkord })
      expect(prompt.startsWith(forventet)).toBe(true)
    }
  })

  // Basis-teksten er klubbconfig (lib/klubb-prompt.ts) med plassholdere.
  // Erstatningen er global: {navn} står to ganger i standardteksten, og en
  // .replace() med streng-argument ville byttet bare den første — da hadde
  // prompten bedt modellen om «{navn} was the best player».
  it('alle forekomster av plassholderne erstattes', () => {
    const prompt = byggBursdagsprompt({ navn: 'Ola Testesen', alder: 45, stikkord: '' })
    expect(prompt).not.toContain('{navn}')
    expect(prompt).not.toContain('{alder}')
    expect(prompt).toContain('45')
  })

  // Uten plassholdere i teksten mister prompten navn og alder helt, uten at
  // noe feiler synlig — bildet blir bare av «en mann». Testen fanger en
  // redigering av standardteksten som glemmer dem.
  it('standardteksten inneholder begge plassholderne', () => {
    expect(BURSDAGSBILDE_PROMPT_BASIS).toContain('{navn}')
    expect(BURSDAGSBILDE_PROMPT_BASIS).toContain('{alder}')
  })

  // Medgjestene viser til «the reference photos after the first one», og
  // rekkefølgen i prompten MÅ matche bilde-lista som sendes til Vertex.
  // Testen pinner koblingen: navnene skal stå i samme rekkefølge de kom inn.
  it('medgjester navngis i oppgitt rekkefølge og viser til referansebildene', () => {
    const prompt = byggBursdagsprompt({
      navn: 'Ola',
      alder: 50,
      stikkord: '',
      medgjester: ['Per', 'Pål'],
    })
    expect(prompt).toContain('Per and Pål')
    expect(prompt).toContain('reference photos after the first one')
    expect(prompt.indexOf('Per')).toBeLessThan(prompt.indexOf('Pål'))
  })

  // Tom liste er normaltilstanden (for få menn med profilbilde, eller et
  // feilet oppslag — se hentMedgjester), ikke en feil. Da skal hele
  // medgjest-setningen utebli, ikke stå igjen som en tom referanse til
  // bilder som aldri ble sendt.
  it('uten medgjester nevnes verken venner eller ekstra referansebilder', () => {
    const prompt = byggBursdagsprompt({ navn: 'Ola', alder: 50, stikkord: '' })
    expect(prompt).not.toContain('friends from the club')
    expect(prompt).not.toContain('reference photos after the first one')
  })

  // Testnavnene her må IKKE være ekte medlemsnavn: sync-skriptet skrubber
  // medlemsnavn på vei til det offentlige klubb-app-repoet, og en skrubbet
  // «Espen» ble til «Per» — som allerede sto i lista, så assertionen
  // not.toContain('Per') feilet der og bare der. Bruk fiktive navn.
  it('flere medgjester enn taket kuttes', () => {
    const prompt = byggBursdagsprompt({
      navn: 'Ola',
      alder: 50,
      stikkord: '',
      medgjester: ['Per', 'Pål', 'Ludvig', 'Vetle'],
    })
    expect(prompt).toContain('Per and Pål')
    expect(prompt).not.toContain('Ludvig')
    expect(prompt).not.toContain('Vetle')
  })

  // Prompten bygges av konkatenerte template literals. Et ekte linjeskift
  // inni en av dem havner rått i teksten som sendes til modellen, sammen med
  // kildekodens innrykk — det skjedde 2026-09-06 og sto i prod til det ble
  // fanget her. Testen over («linjeskift fjernes») dekket det ikke: den
  // sender linjeskift inn via navn/stikkord, ikke via basis-teksten.
  it('basis-teksten er fri for linjeskift og avsluttes ordentlig', () => {
    const prompt = byggBursdagsprompt({ navn: 'Ola', alder: 50, stikkord: '' })
    expect(prompt).not.toContain('\n')
    expect(prompt).not.toContain('  ')
    expect(prompt.trimEnd()).toMatch(/\.$/)
  })

  it('stikkord vevs inn i prompten når de finnes', () => {
    const prompt = byggBursdagsprompt({ navn: 'Ola', alder: 30, stikkord: 'fisking, gitar' })
    expect(prompt).toContain('fisking')
    expect(prompt).toContain('gitar')
  })

  it('linjeskift i navn/stikkord fjernes', () => {
    const prompt = byggBursdagsprompt({ navn: 'Ola\nTestesen', alder: 30, stikkord: 'fis\nking' })
    expect(prompt).not.toContain('\n')
  })

  // Stikkord ble fritekst i #685 (var text[] med maks 10 elementer à 30
  // tegn hver — «kutter per element»). Nå er det ETT felt, og kappingen
  // gjelder hele strengen samlet, ikke lengste enkeltord i den.
  it('kapper hele stikkordfeltet til STIKKORD_MAKS_LENGDE tegn, ikke per element', () => {
    const langt = 'a'.repeat(STIKKORD_MAKS_LENGDE + 20)
    const prompt = byggBursdagsprompt({ navn: 'Ola', alder: 30, stikkord: langt })
    expect(prompt).toContain('a'.repeat(STIKKORD_MAKS_LENGDE))
    expect(prompt).not.toContain('a'.repeat(STIKKORD_MAKS_LENGDE + 1))
  })

  // Kappingen teller KODEPUNKTER, ikke UTF-16-enheter (#685-review). Et
  // emoji som lander akkurat på grensen ble tidligere delt i to av
  // .slice(), og den ensomme surrogaten fulgte med ut i prompten som ble
  // sendt til Vertex. Stikkord er fritekst nå, så et emoji i feltet er en
  // helt normal ting for en mann å skrive.
  it('kapper på kodepunkt, så et emoji på grensen ikke deles i to', () => {
    const stikkord = 'a'.repeat(STIKKORD_MAKS_LENGDE - 1) + '👍'
    const prompt = byggBursdagsprompt({ navn: 'Ola', alder: 30, stikkord })
    expect(prompt).toContain(stikkord)
    // Ensom high surrogate uten sin low = et halvt tegn. Denne regexen er
    // selve beviset: toContain() over ville ikke sett forskjell på et
    // emoji som ble kappet og ett som overlevde hvis vi bare så på 'a'-ene.
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(prompt)).toBe(false)
  })

  // Fritekst er mer utsatt for linjeskift enn et array noen gang var (en
  // mann limer gjerne inn en hel setning med Enter midt i), så pinnes det
  // eksplisitt her, ikke bare implisitt via testen over.
  it('linjeskift midt i et langt, sammenhengende stikkordfelt fjernes også', () => {
    const flerlinjer = 'grillmester\nalltid sist hjem\ngitarist'
    const prompt = byggBursdagsprompt({ navn: 'Ola', alder: 30, stikkord: flerlinjer })
    expect(prompt).not.toContain('\n')
    expect(prompt).toContain('grillmester alltid sist hjem gitarist')
  })
})

describe('statusForFeilklasse', () => {
  it('blokkert er den eneste terminale klassen (avvist)', () => {
    expect(statusForFeilklasse('blokkert')).toBe('avvist')
  })

  // 'ugyldig' er bevisst reclaimable inntil integrasjonen er verifisert mot
  // ekte API én gang — er request-formen vår feil, ville en terminal
  // 'avvist'-rad per mann bare kunne repareres via admins tving-knapp.
  it('auth, kvote, transient og ugyldig er reclaimable (feilet)', () => {
    const reclaimable: VertexFeilKlasse[] = ['auth', 'kvote', 'transient', 'ugyldig']
    for (const klasse of reclaimable) {
      expect(statusForFeilklasse(klasse)).toBe('feilet')
    }
  })
})

describe('tellerSomFeil', () => {
  it('blokkert teller ikke som feil', () => {
    expect(tellerSomFeil('blokkert')).toBe(false)
  })

  it('alle andre klasser teller som feil', () => {
    const andre: VertexFeilKlasse[] = ['auth', 'kvote', 'ugyldig', 'transient']
    for (const klasse of andre) {
      expect(tellerSomFeil(klasse)).toBe(true)
    }
  })
})
