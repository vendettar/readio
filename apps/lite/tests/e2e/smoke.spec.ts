import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, type Page, test } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.join(__dirname, '../fixtures')
const TEST_AUDIO = path.join(FIXTURES_DIR, 'test-audio.mp3')
const TEST_SUBTITLE = path.join(FIXTURES_DIR, 'test-audio.srt')

/**
 * Helper to seed database with mock subscriptions
 */
async function seedSubscriptions(page: Page) {
  await page.evaluate(async () => {
    const db = window.__READIO_TEST__?.db
    if (!db) return

    await db.addSubscription({
      feedUrl: 'https://example.com/rss',
      title: 'E2E Test Podcast',
      author: 'Playwright',
      artworkUrl: '',
      addedAt: Date.now(),
    })
  })
}

test.describe('App Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Ensure we start with a clean state
    await page.evaluate(async () => {
      await window.__READIO_TEST__?.clearAppData()
    })
    await page.reload()
  })

  test('Journey 1: Home -> Upload -> Play', async ({ page }) => {
    // 1. Redirect to /files if empty
    await expect(page).toHaveURL(/\/files/)

    // 2. Upload
    const fileInput = page.getByTestId('audio-file-input')
    await fileInput.setInputFiles([TEST_AUDIO])

    // 3. Play from list
    const playBtn = page.getByTestId('play-track-btn').first()
    await expect(playBtn).toBeVisible()
    await playBtn.click()

    // 4. Check if on Player page and audio is set
    await expect(page).toHaveURL(/\/$/)
    const audio = page.locator('audio')
    await expect(audio).toHaveAttribute('src', /^blob:/)
  })

  test('Journey 2: Subscriptions -> List', async ({ page }) => {
    // 1. Seed data
    await seedSubscriptions(page)

    // 2. Navigate to Subscriptions
    await page.goto('/subscriptions')

    // 3. Assert item is rendered
    const item = page.getByTestId('podcast-card').filter({ hasText: 'E2E Test Podcast' })
    await expect(item).toBeVisible()
  })

  test('Journey 3: Files -> Playback with Subtitles', async ({ page }) => {
    // 1. Upload audio + subtitle
    await page.goto('/files')
    const fileInput = page.getByTestId('audio-file-input')
    await fileInput.setInputFiles([TEST_AUDIO, TEST_SUBTITLE])

    // 2. Start playback
    await page.getByTestId('play-track-btn').first().click()

    // 3. Verify player and transcript
    await expect(page).toHaveURL(/\/$/)
    const transcript = page.locator('#transcript-container')
    await expect(transcript).toBeVisible()
    await expect(page.locator('.subtitle-line')).toHaveCount(3)
  })
})
