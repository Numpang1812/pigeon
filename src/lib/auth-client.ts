import { createAuthClient } from 'better-auth/svelte';
import { writable } from 'svelte/store';

export const auth_client = createAuthClient();

// Store to manage the current user's profile image globally
export const current_user_image = writable<string | null>(null);
