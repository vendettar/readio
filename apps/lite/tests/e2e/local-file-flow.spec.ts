/**
 * E2E Smoke Tests: Local File Playback Flow
 *
 * Protects the critical path:
 * Upload → IndexedDB → Refresh → Restore Playback
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.join(__dirname, 'fixtures')
const TEST_AUDIO = path.join(FIXTURES_DIR, 'test-audio.mp3')
const TEST_SUBTITLE = path.join(FIXTURES_DIR, 'test-subtitle.srt')

test.describe('Local File Playback Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear app state before each test (must close app's IDB connection first)
    await page.goto('/')
    await page.evaluate(async () => {
      await window.__READIO_TEST__?.clearAppData()
    })
    // Reload to ensure fresh state
    await page.reload()
  })

  test('should upload local files and play them', async ({ page }) => {
    await page.goto('/')

    // 1. Open Local Files Modal
    const localFilesBtn = page.locator('#openLocalFilesBtn')
    await expect(localFilesBtn).toBeVisible()
    await localFilesBtn.click()

    // 2. Wait for modal to open
    const modal = page.locator('.localfiles-modal')
    await expect(modal).toBeVisible()

    // 3. Upload files via file input
    const fileInput = page.locator('.localfiles-modal input[type="file"]')
    await fileInput.setInputFiles([TEST_AUDIO, TEST_SUBTITLE])

    // 4. Wait for file to appear in list
    const fileItem = page.locator('.localfiles-item')
    await expect(fileItem).toBeVisible({ timeout: 10000 })

    // 5. Verify file name is shown
    await expect(page.locator('.localfiles-item-title')).toContainText('test-audio.mp3')

    // 6. Click to play the file
    await page.locator('.localfiles-item-main').click()

    // 7. Modal should close
    await expect(modal).toBeHidden()

    // 8. Verify audio element has src (blob URL)
    const audio = page.locator('audio')
    await expect(audio).toHaveAttribute('src', /^blob:/)

    // 9. Verify subtitles are loaded (transcript container is visible)
    const transcript = page.locator('#transcript-container')
    await expect(transcript).toBeVisible()

    // 10. Should have subtitle items (3 lines in test-subtitle.srt)
    await expect(page.locator('.subtitle-line')).toHaveCount(3)
  })

  test('should persist uploaded files in IndexedDB across page refresh', async ({ page }) => {
    await page.goto('/')

    // 1. Open Local Files Modal and upload
    await page.locator('#openLocalFilesBtn').click()
    const modal = page.locator('.localfiles-modal')
    await expect(modal).toBeVisible()

    const fileInput = page.locator('.localfiles-modal input[type="file"]')
    await fileInput.setInputFiles([TEST_AUDIO, TEST_SUBTITLE])

    // 2. Wait for file to appear in list
    await expect(page.locator('.localfiles-item')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.localfiles-item-title')).toContainText('test-audio.mp3')

    // 3. Close modal
    await page.locator('.localfiles-close').click()
    await expect(modal).toBeHidden()

    // 4. Verify session and audio are stored in IndexedDB
    const idbData = await page.evaluate(async () => {
      return new Promise<{ sessions: number; audios: number }>((resolve) => {
        const request = indexedDB.open('readio-v2')
        request.onsuccess = () => {
          const db = request.result
          let sessions = 0
          let audios = 0

          const tx1 = db.transaction(['sessions'], 'readonly')
          tx1.objectStore('sessions').count().onsuccess = (e) => {
            sessions = (e.target as IDBRequest).result

            const tx2 = db.transaction(['audios'], 'readonly')
            tx2.objectStore('audios').count().onsuccess = (e2) => {
              audios = (e2.target as IDBRequest).result
              db.close()
              resolve({ sessions, audios })
            }
          }
        }
      })
    })

    expect(idbData.sessions).toBe(1)
    expect(idbData.audios).toBe(1)

    // 5. Refresh the page
    await page.reload()

    // 6. Verify data persisted after refresh
    const idbDataAfterRefresh = await page.evaluate(async () => {
      return new Promise<{ sessions: number; audios: number }>((resolve) => {
        const request = indexedDB.open('readio-v2')
        request.onsuccess = () => {
          const db = request.result
          let sessions = 0
          let audios = 0

          const tx1 = db.transaction(['sessions'], 'readonly')
          tx1.objectStore('sessions').count().onsuccess = (e) => {
            sessions = (e.target as IDBRequest).result

            const tx2 = db.transaction(['audios'], 'readonly')
            tx2.objectStore('audios').count().onsuccess = (e2) => {
              audios = (e2.target as IDBRequest).result
              db.close()
              resolve({ sessions, audios })
            }
          }
        }
      })
    })

    expect(idbDataAfterRefresh.sessions).toBe(1)
    expect(idbDataAfterRefresh.audios).toBe(1)

    // 7. Open Local Files Modal and verify file is still listed
    await page.locator('#openLocalFilesBtn').click()
    await expect(page.locator('.localfiles-modal')).toBeVisible()
    await expect(page.locator('.localfiles-item')).toBeVisible()
    await expect(page.locator('.localfiles-item-title')).toContainText('test-audio.mp3')

    // 8. Play the file to verify it's fully restorable
    await page.locator('.localfiles-item-main').click()

    // 9. Verify audio loads correctly
    const audio = page.locator('audio')
    await expect(audio).toHaveAttribute('src', /^blob:/)

    // 10. Verify subtitles are restored
    await expect(page.locator('.subtitle-line')).toHaveCount(3)
  })

  test('should restore playback progress after page refresh', async ({ page }) => {
    await page.goto('/')

    // 1. Upload files and start playback
    await page.locator('#openLocalFilesBtn').click()
    const modal = page.locator('.localfiles-modal')
    await expect(modal).toBeVisible()

    const fileInput = page.locator('.localfiles-modal input[type="file"]')
    await fileInput.setInputFiles([TEST_AUDIO, TEST_SUBTITLE])

    await expect(page.locator('.localfiles-item')).toBeVisible({ timeout: 10000 })
    await page.locator('.localfiles-item-main').click()
    await expect(modal).toBeHidden()

    // 2. Wait for audio to be loaded
    const audio = page.locator('audio')
    await expect(audio).toHaveAttribute('src', /^blob:/)

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

    // 7. Open Local Files and restore playback
    await page.locator('#openLocalFilesBtn').click()
    await expect(page.locator('.localfiles-modal')).toBeVisible()
    await expect(page.locator('.localfiles-item')).toBeVisible()
    await page.locator('.localfiles-item-main').click()

    // 8. Wait for audio to load
    await expect(page.locator('audio')).toHaveAttribute('src', /^blob:/)

    // 9. Wait for progress to be restored (give it time for async restore)
    await page.waitForTimeout(1000)

    // 10. Verify currentTime is restored (within ±1 second tolerance)
    const restoredTime = await page.evaluate(() => {
      const audioEl = document.querySelector('audio')
      return audioEl ? audioEl.currentTime : 0
    })

    expect(restoredTime).toBeGreaterThanOrEqual(TARGET_TIME - 1)
    expect(restoredTime).toBeLessThanOrEqual(TARGET_TIME + 1)
  })
})
