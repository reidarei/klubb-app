import { test, expect } from '@playwright/test'
import { harTestCreds } from './helpers/auth'

// Vakt mot #731: `interactiveWidget` i app/layout.tsx må stå på
// 'resizes-visual'. Safari ignorerer meta-taggen uansett verdi, så den gamle
// verdien ('overlays-content') var usynlig på iPhone — men på Android
// Chromium slo den av visualViewport-krympingen som ALLE tastatur-hooks i
// components/chat/hooks/useKeyboardOffset.ts hviler på. Dette er den eneste
// automatiske porten som kunne fanget regresjonen; se CLAUDE.md
// § Policy: Skrivefelt og iOS-tastatur.
test.describe('viewport-meta — interactive-widget', () => {
  test.skip(!harTestCreds(), 'TEST_EPOST/TEST_PASSORD mangler — se e2e/README.md')

  test('viewport-meta ber om resizes-visual, aldri overlays-content', async ({ page }) => {
    await page.goto('/chat')

    const content = await page.locator('meta[name="viewport"]').getAttribute('content')
    expect(content, 'fant ingen viewport-meta-tag').not.toBeNull()

    expect(
      content,
      'interactive-widget=resizes-visual mangler — uten den krymper ikke ' +
        'visualViewport på Android, og hele tastatur-håndteringen (chat-pill, ' +
        'kart-panel, timeplan, bildekommentarer) faller stille tilbake til 0',
    ).toContain('interactive-widget=resizes-visual')

    expect(
      content,
      'overlays-content slår av visualViewport-krympingen på Android — se #731',
    ).not.toContain('overlays-content')
  })
})
