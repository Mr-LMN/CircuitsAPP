import { expect, test } from '@playwright/test';

test('shows a usable setup screen when Firebase configuration is missing', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
	await expect(page.getByRole('alert')).toContainText('Setup needed');
	await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeDisabled();
});

test('ignores unsafe redirect parameters', async ({ page }) => {
	await page.goto('/?redirect=//malicious.example');
	await expect(page).toHaveURL(/redirect=%2F%2Fmalicious\.example|redirect=\/\/malicious\.example/);
	await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
});
