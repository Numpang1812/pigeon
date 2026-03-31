# Authentication Implementation Plan: BetterAuth vs Clerk

## Project Context

- **Framework**: SvelteKit 2.x
- **Database**: libSQL/Turso (already configured)
- **Frontend**: Custom login/signup pages already built (`src/lib/+login.svelte`, `src/lib/+signup.svelte`)
- **SSO Requirements**: Google and Apple sign-in (`src/lib/components/SsoButton.svelte`)
- **Current State**: Frontend calls `/api/auth/login` and `/api/auth/signup` (endpoints not yet implemented)

---

## Comparison Overview

| Feature                  | BetterAuth                       | Clerk                             |
| ------------------------ | -------------------------------- | --------------------------------- |
| **Type**                 | Self-hosted library              | Hosted SaaS service               |
| **Pricing**              | Free (open source)               | Free tier + paid plans            |
| **Database**             | Your database (libSQL supported) | Clerk-managed                     |
| **SSO Support**          | Google, Apple, +20 providers     | Google, Apple, +20 providers      |
| **Frontend Integration** | Full control with your UI        | Pre-built components OR custom UI |
| **Session Management**   | Your implementation              | Handled by Clerk                  |
| **Data Ownership**       | 100% yours                       | Stored on Clerk servers           |
| **Vendor Lock-in**       | None                             | Moderate                          |
| **Setup Complexity**     | Medium                           | Low                               |

---

## Option 1: BetterAuth (Recommended for Your Project)

### Why BetterAuth Fits Your Project

1. **You already have custom frontend** - BetterAuth gives you full control over UI
2. **You have libSQL/Turso** - BetterAuth supports it natively
3. **No vendor lock-in** - All user data stays in your database
4. **Free and open source** - No monthly costs
5. **SSO supported** - Google and Apple OAuth fully supported

### Implementation Steps

#### Step 1: Install Dependencies

```bash
pnpm add better-auth @better-auth/svelte
```

#### Step 2: Create Auth Configuration

Create `src/lib/auth.ts`:

```typescript
import { betterAuth } from 'better-auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';

export const auth = betterAuth({
	database: {
		// Your libSQL/Turso connection
		url: process.env.TURSO_DB_URL!,
		token: process.env.TURSO_DB_TOKEN!
	},
	emailAndPassword: {
		enabled: true
	},
	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID!,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET!
		},
		apple: {
			clientId: process.env.APPLE_CLIENT_ID!,
			teamId: process.env.APPLE_TEAM_ID!,
			keyId: process.env.APPLE_KEY_ID!,
			privateKey: process.env.APPLE_PRIVATE_KEY!
		}
	}
});

export const { handle } = svelteKitHandler({ auth });
```

#### Step 3: Create API Routes

**`src/routes/api/auth/login/+server.ts`**:

```typescript
import { auth } from '$lib/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	return auth.handler(request);
};
```

**`src/routes/api/auth/signup/+server.ts`**:

```typescript
import { auth } from '$lib/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	return auth.handler(request);
};
```

**`src/routes/api/auth/[...all]/+server.ts`** (catch-all for BetterAuth endpoints):

```typescript
import { auth } from '$lib/auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	return auth.handler(request);
};

export const POST: RequestHandler = async ({ request }) => {
	return auth.handler(request);
};
```

#### Step 4: Hook for Session Management

**`src/hooks.server.ts`**:

```typescript
import { auth } from '$lib/auth';

export const handle = auth.handle;
```

#### Step 5: Update Frontend Components

**Update `src/lib/+login.svelte`**:

```typescript
<script lang="ts">
  import { goto } from '$app/navigation';
  import { authClient } from '$lib/auth-client'; // Create this file

  let username = $state('');
  let password = $state('');
  let error = $state<string | null>(null);
  let loading = $state(false);

  async function handle_submit(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    loading = true;

    try {
      const { data, error: authError } = await authClient.signIn.email({
        email: username,
        password: password,
      });

      if (authError) {
        throw new Error(authError.message);
      }

      goto('/');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Login failed';
    } finally {
      loading = false;
    }
  }

  // SSO handler
  async function handle_sso(provider: 'google' | 'apple') {
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: '/',
    });
    if (error) {
      console.error(error);
    }
  }
</script>
```

**Create `src/lib/auth-client.ts`**:

```typescript
import { createAuthClient } from 'better-auth/svelte';

export const authClient = createAuthClient({
	baseURL: 'http://localhost:5173' // Your dev URL
});
```

#### Step 6: Update SsoButton Component

**Update `src/lib/components/SsoButton.svelte`**:

```typescript
<script lang="ts">
  import { authClient } from '$lib/auth-client';

  let {
    provider = 'google',
    onclick
  }: {
    provider?: 'google' | 'apple';
    onclick?: (e: MouseEvent) => void;
  } = $props();

  async function handle_click(e: MouseEvent) {
    onclick?.(e);
    if (!e.defaultPrevented) {
      await authClient.signIn.social({
        provider,
        callbackURL: '/',
      });
    }
  }
</script>

<button type="button" class="sso-btn" onclick={handle_click}>
  <!-- SVG icons remain the same -->
</button>
```

#### Step 7: Environment Variables

Update `.env`:

```bash
TURSO_DB_URL=your-turso-url
TURSO_DB_TOKEN=your-turso-token

# BetterAuth
BETTER_AUTH_SECRET=your-secret-key-generate-random-32-chars

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Apple OAuth
APPLE_CLIENT_ID=your-apple-client-id
APPLE_TEAM_ID=your-apple-team-id
APPLE_KEY_ID=your-apple-key-id
APPLE_PRIVATE_KEY=your-apple-private-key
```

---

## Option 2: Clerk

### Why Consider Clerk

1. **Fastest setup** - Minimal code required
2. **Managed service** - No session/database management
3. **Pre-built components** - Can replace your UI if needed
4. **Excellent SSO** - Google, Apple, and many providers out-of-the-box

### Trade-offs

- **User data on Clerk servers** - Not in your libSQL database
- **Monthly costs** - Free tier (10k MAU), then $25/month
- **Custom UI requires extra work** - You'd use Clerk's headless hooks

### Implementation Steps

#### Step 1: Install Dependencies

```bash
pnpm add @clerk/clerk-js
```

#### Step 2: Initialize Clerk

**`src/lib/clerk.ts`**:

```typescript
import Clerk from '@clerk/clerk-js';

export const clerk = new Clerk(import.meta.env.PUBLIC_CLERK_PUBLISHABLE_KEY);

export async function initClerk() {
	await clerk.load();
}
```

#### Step 3: Update Layout

**`src/routes/+layout.svelte`**:

```typescript
<script lang="ts">
  import { onMount } from 'svelte';
  import { clerk, initClerk } from '$lib/clerk';
  import '../app.css';

  let loaded = $state(false);

  onMount(async () => {
    await initClerk();
    loaded = true;
  });
</script>

{#if loaded}
  <slot />
{/if}
```

#### Step 4: Update Login Component

**`src/lib/+login.svelte`**:

```typescript
<script lang="ts">
  import { clerk } from '$lib/clerk';
  import { goto } from '$app/navigation';

  let email = $state('');
  let password = $state('');
  let error = $state<string | null>(null);

  async function handle_submit(e: SubmitEvent) {
    e.preventDefault();
    try {
      await clerk.signIn.create({
        identifier: email,
        password,
      });
      goto('/');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Login failed';
    }
  }

  async function handle_sso(strategy: 'oauth_google' | 'oauth_apple') {
    await clerk.signIn.create({ strategy });
  }
</script>
```

#### Step 5: Environment Variables

```bash
PUBLIC_CLERK_PUBLISHABLE_KEY=your-clerk-publishable-key
CLERK_SECRET_KEY=your-clerk-secret-key
```

---

## Recommendation

### Choose **BetterAuth** because:

1. ✅ **Your frontend is already built** - BetterAuth integrates seamlessly without forcing UI changes
2. ✅ **You have libSQL/Turso** - Native support, user data in your database
3. ✅ **SSO is fully supported** - Google and Apple OAuth work out-of-the-box
4. ✅ **No ongoing costs** - Free, open-source
5. ✅ **Full control** - Customize auth flows as needed
6. ✅ **SvelteKit integration** - First-class SvelteKit support

### When to Choose Clerk Instead:

- You want zero maintenance for auth infrastructure
- You need advanced features like organization management immediately
- You don't mind user data being stored externally
- Budget allows for $25+/month after free tier

---

## Next Steps (BetterAuth Path)

1. [ ] Create BetterAuth account at [better-auth.com](https://www.better-auth.com) for documentation
2. [ ] Set up Google OAuth credentials (Google Cloud Console)
3. [ ] Set up Apple Sign In (Apple Developer Account)
4. [ ] Install `better-auth` and `@better-auth/svelte`
5. [ ] Create `src/lib/auth.ts` configuration
6. [ ] Create API route handlers
7. [ ] Create `src/hooks.server.ts`
8. [ ] Update login/signup components with auth-client
9. [ ] Update `SsoButton.svelte` with SSO handler
10. [ ] Test email/password + Google + Apple sign-in flows

---

## Resources

- **BetterAuth Docs**: https://www.better-auth.com
- **BetterAuth SvelteKit**: https://www.better-auth.com/docs/integrations/svelte-kit
- **BetterAuth SSO**: https://www.better-auth.com/docs/authentication/social-auth
- **Clerk Docs**: https://clerk.com/docs
- **Google OAuth Setup**: https://developers.google.com/identity/protocols/oauth2
- **Apple Sign In Setup**: https://developer.apple.com/sign-in-with-apple/
