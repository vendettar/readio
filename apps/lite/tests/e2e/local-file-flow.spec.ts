/**
 * E2E Smoke Tests: Local File Playback Flow
 *
 * Protects the critical path:
 * Upload → IndexedDB → Refresh → Restore Playback
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.join(__dirname, 'fixtures')
const TEST_AUDIO = path.join(FIXTURES_DIR, 'test-audio.mp3')
const TEST_SUBTITLE = path.join(FIXTURES_DIR, 'test-audio.srt')
const TEST_VTT = path.join(FIXTURES_DIR, 'test-audio.vtt')

/**
 * Helper to get counts from IndexedDB stores using the exposed app DB instance
 */
async function getIdbCounts(page: Page, storeNames: string[]): Promise<Record<string, number>> {
  return page.evaluate(async (names: string[]) => {
    // biome-ignore lint/suspicious/noExplicitAny: access app internal state
    const rawDb = (window as any).__READIO_TEST__?.rawDb
    if (!rawDb) {
      console.error('[getIdbCounts] rawDb not found on window.__READIO_TEST__')
      return {}
    }

    const results: Record<string, number> = {}
    for (const name of names) {
      try {
        const table = rawDb[name]
        if (!table) {
          results[name] = 0
          continue
        }
        results[name] = await table.count()
      } catch (_err) {
        results[name] = 0
      }
    }
    return results
  }, storeNames)
}

test.describe('Local File Playback Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Capture browser logs
    page.on('console', (msg) => {
      console.log(`[BROWSER] ${msg.type()}: ${msg.text()}`)
    })

    // Navigate to a blank page first to prevent app from accessing DB while clearing
    await page.goto('about:blank')
    await page.goto('/') // Go to / to get the exposed test helpers
    await page.evaluate(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: access app internal state
      await (window as any).__READIO_TEST__?.clearAppData()
    })
    // Go to home page to trigger redirect
    await page.goto('/')
    // Reload to ensure fresh state
    await page.reload()
  })

  test('should upload local files and play them', async ({ page }) => {
    await page.goto('/')

    // 1. Verify redirect to files page
    await expect(page).toHaveURL(/\/files/)

    // 2. Click Add Audio button
    const addAudioBtn = page.getByTestId('add-audio-btn')
    await expect(addAudioBtn).toBeVisible()
    await addAudioBtn.click()

    // 3. Upload files via hidden file input
    const fileInput = page.getByTestId('audio-file-input')
    await fileInput.setInputFiles([TEST_AUDIO, TEST_SUBTITLE])

    // 4. Wait for track card to appear
    const trackCard = page.locator('.track-card')
    await expect(trackCard).toBeVisible({ timeout: 10000 })

    // 5. Verify track name is shown
    await expect(trackCard.locator('h3')).toContainText('test-audio')

    // 6. Click to play the file
    const playBtn = trackCard.getByTestId('play-track-btn').first()
    await expect(playBtn).toBeVisible()
    await playBtn.click()

    // 7. Verify navigation to home page
    try {
      await expect(page).toHaveURL(/\/$/)
    } catch (err) {
      await page.screenshot({ path: 'tests/.output/failure-play.png' })
      throw err
    }

    // 8. Verify audio element has src (blob URL)
    const audio = page.locator('audio')
    await expect(audio).toHaveAttribute('src', /^blob:/, { timeout: 10000 })

    // 9. Verify subtitles are loaded (transcript container is visible)
    const transcript = page.locator('#transcript-container')
    await expect(transcript).toBeVisible()

    // 10. Should have subtitle items (3 lines in test-subtitle.srt)
    await expect(page.locator('.subtitle-line')).toHaveCount(3)
  })

  test('should persist uploaded files in IndexedDB across page refresh', async ({ page }) => {
    await page.goto('/')

    // 1. Upload files
    await expect(page).toHaveURL(/\/files/)
    const fileInput = page.getByTestId('audio-file-input')
    await fileInput.setInputFiles([TEST_AUDIO, TEST_SUBTITLE])

    // 2. Wait for file to appear in list
    await expect(page.locator('.track-card')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.track-card h3')).toContainText('test-audio')

    // 3. Verify track and audio are stored in IndexedDB (NOT session yet)
    const idbData = await getIdbCounts(page, ['local_tracks', 'audioBlobs'])
    expect(idbData.local_tracks).toBe(1)
    expect(idbData.audioBlobs).toBe(1)

    // 4. Refresh the page
    await page.reload()

    // 5. Verify data persisted after refresh
    const idbDataAfterRefresh = await getIdbCounts(page, ['local_tracks', 'audioBlobs'])
    expect(idbDataAfterRefresh.local_tracks).toBe(1)
    expect(idbDataAfterRefresh.audioBlobs).toBe(1)

    // 6. Verify file is still listed
    await expect(page.locator('.track-card')).toBeVisible()
    await expect(page.locator('.track-card h3')).toContainText('test-audio')

    // 7. Play the file to verify it's fully restorable
    await page.locator('.track-card').getByTestId('play-track-btn').first().click()

    // 8. Verify navigation and session creation
    await expect(page).toHaveURL(/\/$/)
    // 9. Verify audio loads correctly
    const audio = page.locator('audio')
    await expect(audio).toHaveAttribute('src', /^blob:/, { timeout: 15000 })

    // 10. Verify session creation - wait a bit for DB transaction
    await page.waitForTimeout(1000)
    const idbDataFinal = await getIdbCounts(page, ['playback_sessions'])
    expect(idbDataFinal.playback_sessions).toBe(1)

    // 10. Verify subtitles are restored
    await expect(page.locator('.subtitle-line')).toHaveCount(3)
  })

  test('should restore playback progress after page refresh', async ({ page }) => {
    await page.goto('/')

    // 1. Upload files and start playback
    await expect(page).toHaveURL(/\/files/)
    const fileInput = page.getByTestId('audio-file-input')
    await fileInput.setInputFiles([TEST_AUDIO, TEST_SUBTITLE])

    await expect(page.locator('.track-card')).toBeVisible({ timeout: 10000 })
    await page.locator('.track-card').getByTestId('play-track-btn').first().click()

    // 2. Wait for audio to be loaded (redirects to home /)
    await expect(page).toHaveURL(/\/$/)
    const audio = page.locator('audio')
    await expect(audio).toHaveAttribute('src', /^blob:/, { timeout: 10000 })

    // 3. Seek to a specific position (e.g., 2 seconds into the audio)
    const TARGET_TIME = 2.0
    await page.evaluate((time) => {
      const audioEl = document.querySelector('audio')
      if (audioEl) {
        audioEl.currentTime = time
        // Trigger timeupdate to ensure progress is registered
        audioEl.dispatchEvent(new Event('timeupdate'))
      }
    }, TARGET_TIME)

    // 4. Wait for progress to be saved (SAVE_INTERVAL is 5 seconds, but we can trigger save via timeupdate)
    // Wait a bit for the save to complete
    await page.waitForTimeout(1000)

    // 5. Force a final timeupdate to ensure progress is saved
    await page.evaluate(() => {
      const audioEl = document.querySelector('audio')
      if (audioEl) {
        audioEl.dispatchEvent(new Event('timeupdate'))
      }
    })
    await page.waitForTimeout(500)

    // 6. Refresh the page
    await page.reload()

    // 7. Verify we are on home page with restored session (Redirect should NOT happen if sessionId exists)
    await expect(page).toHaveURL(/\/$/)

    // 8. Verify audio loads
    await expect(page.locator('audio')).toHaveAttribute('src', /^blob:/, { timeout: 10000 })

    // 9. Wait for progress to be restored (give it time for async restore)
    await page.waitForTimeout(1000)

    // 10. Verify currentTime is restored (within ±1 second tolerance)
    const restoredTime = await page.evaluate(() => {
      const audioEl = document.querySelector('audio')
      return audioEl ? audioEl.currentTime : 0
    })

    const TOLERANCE = process.env.CI ? 2 : 1
    expect(restoredTime).toBeCloseTo(TARGET_TIME, TOLERANCE)
  })

  test('should support VTT subtitles', async ({ page }) => {
    await page.goto('/')

    // 1. Upload audio + VTT
    const fileInput = page.getByTestId('audio-file-input')
    await fileInput.setInputFiles([TEST_AUDIO, TEST_VTT])

    // 2. Play the file
    const trackCard = page.locator('.track-card', { hasText: 'test-audio' })
    await trackCard.getByTestId('play-track-btn').first().click()

    // 3. Verify navigation and transcript
    await expect(page).toHaveURL(/\/$/)
    const transcript = page.locator('#transcript-container')
    await expect(transcript).toBeVisible()

    // 4. Verify VTT content (2 lines in test-vtt.vtt)
    // One line has standard HH:MM:SS.ms, another has short MM:SS.ms
    await expect(page.locator('.subtitle-line')).toHaveCount(2)
    await expect(page.locator('.subtitle-line').first()).toContainText('First VTT line')
    await expect(page.locator('.subtitle-line').last()).toContainText('Second VTT line')
  })
})
