import { expect, test } from '@playwright/test'

test.describe('Memory Stress Test', () => {
  // This test is skipped by default as it is a long-running manual profiling tool
  // Run with: npx playwright test apps/lite/tests/stress/memory.test.ts --project=chromium --headed
  test.skip('long running memory stress test', async ({ page }) => {
    // 2 hours timeout
    test.setTimeout(2 * 60 * 60 * 1000)

    console.log('Starting Memory Stress Test...')

    // Initial Load
    await page.goto('/')
    await expect(page.getByText('Readio')).toBeVisible()

    const iterations = 50

    for (let i = 0; i < iterations; i++) {
      console.log(`Iteration ${i + 1}/${iterations}`)

      // 1. Go to Explore
      await page.getByRole('link', { name: 'Explore' }).click()
      await expect(page.getByText('Discover Podcasts')).toBeVisible()

      // Wait for results/animations
      await page.waitForTimeout(1000)

      // 2. Perform Search (Trigger Network & List Rendering)
      const searchInput = page.getByPlaceholder('Search podcasts...')
      await searchInput.click()
      await searchInput.fill('tech')
      await searchInput.press('Enter')

      // Wait for search results
      await page.waitForTimeout(3000)

      // 3. Open Settings (Trigger different route components)
      await page.getByRole('link', { name: 'Settings' }).click()
      await expect(page.getByText('Storage')).toBeVisible()

      // Wait for settings to settle
      await page.waitForTimeout(1000)

      // 4. Navigate to Files (Trigger File List)
      await page.getByRole('link', { name: 'Files' }).click()
      await expect(page.getByText('My Files')).toBeVisible()

      // Wait for files
      await page.waitForTimeout(1000)

      // 5. Navigate back to Home
      await page.getByRole('link', { name: 'Home' }).click()

      // Small pause between iterations
      await page.waitForTimeout(1000)
    }

    console.log('Stress Test Completed')
  })
})
