import { createAuthClient } from 'better-auth/svelte';

export const auth_client = createAuthClient({
	baseURL: import.meta.env.DEV ? 'http://localhost:5173' : undefined
});
