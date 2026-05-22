import { expect, type Page, test } from '@playwright/test'

async function waitForTestHarness(page: Page) {
  await page.waitForFunction(() => !!window.__READIO_TEST__)
}

async function seedLibraryRecords(page: Page) {
  await waitForTestHarness(page)
  await page.evaluate(async () => {
    const db = window.__READIO_TEST__?.db
    if (!db) throw new Error('Test harness DB not found')

    await db.addFavorite({
      key: '9001::fav-episode-guid-9001',
      audioUrl: 'https://example.com/favorite.mp3',
      episodeTitle: 'E2E Favorite Canonical Episode',
      podcastTitle: 'E2E Favorite Podcast',
      artworkUrl: 'https://example.com/favorite.jpg',
      episodeArtworkUrl: '',
      description: 'test',
      pubDate: 1738368000,
      durationSeconds: 0,
      addedAt: Date.now(),
      countryAtSave: 'us',
      podcastItunesId: '9001',
      episodeGuid: 'fav-episode-guid-9001',
    })

    await db.createPlaybackSession({
      source: 'explore',
      title: 'E2E History Canonical Episode',
      createdAt: Date.now(),
      lastPlayedAt: Date.now(),
      sizeBytes: 0,
      durationSeconds: 120,
      audioId: null,
      subtitleId: null,
      hasAudioBlob: false,
      progress: 0,
      audioFilename: '',
      subtitleFilename: '',
      audioUrl: 'https://example.com/history.mp3',
      artworkUrl: 'https://example.com/history.jpg',
      showTitle: 'E2E History Podcast',
      countryAtSave: 'jp',
      podcastItunesId: '9002',
      episodeGuid: 'hist-episode-guid-9002',
    })
  })
}

async function searchAndSelectFromPalette(page: Page, query: string, itemTitle: string) {
  await page.getByTestId('command-palette-anchor').click()
  const input = page.locator('[cmdk-input]')
  await input.fill(query)
  await expect(page.getByText(itemTitle, { exact: true })).toBeVisible()
  await page.getByText(itemTitle, { exact: true }).click()
}

test.describe('CommandPalette library navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForTestHarness(page)
    await page.evaluate(async () => {
      await window.__READIO_TEST__?.clearAppData()
    })
    await seedLibraryRecords(page)
    await page.reload()
  })

  test('navigates favorite/history items to canonical episode routes without source query', async ({
    page,
  }) => {
    await searchAndSelectFromPalette(
      page,
      'E2E Favorite Canonical',
      'E2E Favorite Canonical Episode'
    )
    await expect(page).toHaveURL(/\/us\/podcast\/9001\/episode\/.+fav-episode-guid-9001$/)
    expect(page.url()).not.toContain('?source=')

    await page.goto('/')

    await searchAndSelectFromPalette(page, 'E2E History Canonical', 'E2E History Canonical Episode')
    await expect(page).toHaveURL(/\/jp\/podcast\/9002\/episode\/.+hist-episode-guid-9002$/)
    expect(page.url()).not.toContain('?source=')
  })
})
