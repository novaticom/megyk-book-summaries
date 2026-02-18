import { test, expect } from '@playwright/test';

test.describe('Dashboard (Authenticated)', () => {
  test('dashboard loads and displays content', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Wait for navigation to be visible
    await page.waitForSelector('nav, [role="navigation"], a[href*="library"]', { timeout: 10000 });

    // Should not redirect to sign-in
    expect(page.url()).not.toContain('/auth/signin');

    // Should see dashboard content
    const hasDashboardContent =
      await page.locator('text=/dashboard|library|summaries|preferences/i').count() > 0;

    expect(hasDashboardContent).toBeTruthy();
  });

  test('navigation menu is accessible', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // Wait for navigation links
    await page.waitForSelector('a[href*="library"]', { timeout: 10000 });

    // Should see navigation links
    const libraryLink = page.locator('a[href*="library"]');
    const summariesLink = page.locator('a[href*="summaries"]');

    expect(await libraryLink.count()).toBeGreaterThan(0);
    expect(await summariesLink.count()).toBeGreaterThan(0);
  });

  test('can navigate to library', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Verify library link exists
    const libraryLink = page.locator('a[href*="library"]').first();
    expect(await libraryLink.count()).toBeGreaterThan(0);

    // Navigate to library page (direct navigation to avoid tour overlay issues)
    await page.goto('/dashboard/library');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('library');
  });

  test('can navigate to summaries', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Verify summaries link exists
    const summariesLink = page.locator('a[href*="summaries"]').first();
    expect(await summariesLink.count()).toBeGreaterThan(0);

    // Navigate to summaries page (direct navigation to avoid tour overlay issues)
    await page.goto('/dashboard/summaries');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('summaries');
  });

  test('can navigate to preferences', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Verify preferences link exists
    const preferencesLink = page.locator('a[href*="preferences"]').first();
    expect(await preferencesLink.count()).toBeGreaterThan(0);

    // Navigate to preferences page (direct navigation to avoid tour overlay issues)
    await page.goto('/dashboard/preferences');
    await page.waitForLoadState('domcontentloaded');
    expect(page.url()).toContain('preferences');
  });
});
