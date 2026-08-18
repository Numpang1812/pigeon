import { expect, test } from '@playwright/test';

/**
 * Scope is deliberately narrow: the suite has no auth fixture, so a two-user
 * flight would mean building session seeding first. The route guard is the part
 * worth pinning down here; everything else is covered by unit tests and the
 * manual steps in PIGEON_POST_PLAN.md.
 */

test('pigeon post is behind the auth gate', async ({ page }) => {
	await page.goto('/messages');

	// hooks.server.ts redirects anything outside the public routes to '/'.
	await expect(page).toHaveURL('/');
});

test('a conversation url is behind the auth gate too', async ({ page }) => {
	await page.goto('/messages/00000000-0000-0000-0000-000000000000');

	await expect(page).toHaveURL('/');
});
