<script lang="ts">
	import { MapPin, LoaderCircle, TriangleAlert, RotateCcw } from 'lucide-svelte';

	type PendingPosition = {
		lat: number;
		lng: number;
		accuracy_m: number | null;
	};

	type Props = {
		/** Whether the user may close the gate and keep using the rest of the app. */
		dismissible?: boolean;
		/** Copy shown above the button, so /messages can explain itself differently. */
		reason?: string;
		on_saved?: () => void;
		on_dismiss?: () => void;
	};

	const {
		dismissible = true,
		reason = 'A pigeon needs to know where it is flying from, so Pigeon needs your location once.',
		on_saved,
		on_dismiss
	}: Props = $props();

	let requesting = $state(false);
	let saving = $state(false);
	let error_message = $state<string | null>(null);
	let pending_position = $state<PendingPosition | null>(null);

	const accuracy_label = $derived.by(() => {
		const accuracy = pending_position?.accuracy_m;
		if (!accuracy) return null;
		if (accuracy < 1000) return `${Math.round(accuracy)} m`;
		return `${Math.round(accuracy / 1000)} km`;
	});

	// Wi-Fi and IP-based fixes on desktop can be tens of kilometres out, which
	// would quietly distort every flight time. Say so rather than hide it.
	const is_coarse = $derived((pending_position?.accuracy_m ?? 0) > 25_000);

	function describe_position_error(error: unknown): string {
		const code = (error as { code?: number } | null)?.code;

		if (code === 1) {
			return 'Location permission was blocked. You can allow it in your browser settings, then try again.';
		}
		if (code === 2) {
			return 'Your device could not work out where it is. Check that location services are on.';
		}
		if (code === 3) {
			return 'Finding your location took too long. Try again.';
		}
		return 'Could not read your location.';
	}

	async function check_permission_state(): Promise<PermissionState | null> {
		if (!('permissions' in navigator)) return null;

		try {
			const permission = await navigator.permissions.query({
				name: 'geolocation'
			});
			return permission.state;
		} catch {
			return null;
		}
	}

	function read_position(): Promise<GeolocationPosition> {
		return new Promise((resolve, reject) => {
			navigator.geolocation.getCurrentPosition(resolve, reject, {
				enableHighAccuracy: true,
				timeout: 20_000,
				maximumAge: 0
			});
		});
	}

	async function request_location() {
		error_message = null;

		if (!('geolocation' in navigator)) {
			error_message = 'This browser cannot share a location.';
			return;
		}

		const permission_state = await check_permission_state();
		if (permission_state === 'denied') {
			error_message =
				'Location permission is blocked in this browser. Please enable it in your browser settings and try again.';
			return;
		}

		requesting = true;
		try {
			const position = await read_position();
			pending_position = {
				lat: position.coords.latitude,
				lng: position.coords.longitude,
				accuracy_m: position.coords.accuracy ?? null
			};
		} catch (error) {
			error_message = describe_position_error(error);
		} finally {
			requesting = false;
		}
	}

	async function confirm_location() {
		if (!pending_position) return;

		error_message = null;
		saving = true;

		try {
			const response = await fetch('/api/pigeon/home', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(pending_position)
			});

			if (!response.ok) {
				const payload = await response.json().catch(() => null);
				error_message =
					payload?.error === 'invalid_coords'
						? 'That location did not look valid. Try again.'
						: 'Could not save your loft. Try again.';
				return;
			}

			pending_position = null;
			on_saved?.();
		} catch {
			error_message = 'Could not reach the server. Try again.';
		} finally {
			saving = false;
		}
	}

	function retry() {
		pending_position = null;
		error_message = null;
	}
</script>

<div class="loft-gate" role="dialog" aria-modal="true" aria-labelledby="loft-gate-title">
	<div class="loft-gate__backdrop"></div>
	<div class="loft-gate__panel">
		<div class="loft-gate__icon" aria-hidden="true">
			<MapPin size={28} />
		</div>

		<h2 id="loft-gate-title">Set your home loft</h2>

		{#if pending_position}
			<p>
				Your loft is set to within {accuracy_label ?? 'an unknown distance'}. Flight times are
				measured from here.
			</p>

			{#if is_coarse}
				<p class="loft-gate__warning">
					<TriangleAlert size={16} />
					That is quite approximate. On a laptop this can be tens of kilometres out — worth retrying on
					your phone if it looks wrong.
				</p>
			{/if}

			<div class="loft-gate__actions">
				<button
					type="button"
					class="loft-gate__primary"
					onclick={confirm_location}
					disabled={saving}
				>
					{#if saving}
						<LoaderCircle size={16} class="loft-gate__spinner" />
						Saving
					{:else}
						Save this loft
					{/if}
				</button>
				<button type="button" class="loft-gate__secondary" onclick={retry} disabled={saving}>
					<RotateCcw size={16} />
					Try again
				</button>
			</div>
		{:else}
			<p>{reason}</p>
			<p class="loft-gate__note">
				Your exact position is never shown to anyone else. Friends only see the distance between
				you, and the map rounds every position to about a kilometre.
			</p>

			<div class="loft-gate__actions">
				<button
					type="button"
					class="loft-gate__primary"
					onclick={request_location}
					disabled={requesting}
				>
					{#if requesting}
						<LoaderCircle size={16} class="loft-gate__spinner" />
						Finding you
					{:else}
						Share my location
					{/if}
				</button>
				{#if dismissible}
					<button type="button" class="loft-gate__secondary" onclick={() => on_dismiss?.()}>
						Not now
					</button>
				{/if}
			</div>
		{/if}

		{#if error_message}
			<p class="loft-gate__error" role="alert">{error_message}</p>
		{/if}
	</div>
</div>

<style>
	.loft-gate {
		position: fixed;
		inset: 0;
		z-index: 2000;
		display: grid;
		place-items: center;
		padding: 1.5rem;
	}

	.loft-gate__backdrop {
		position: absolute;
		inset: 0;
		background: rgba(15, 23, 42, 0.55);
		backdrop-filter: blur(2px);
	}

	.loft-gate__panel {
		position: relative;
		width: min(460px, 100%);
		background: #ffffff;
		border: 1px solid #e2e8f0;
		border-radius: 1.25rem;
		padding: 2rem;
		text-align: center;
		box-shadow: 0 24px 60px rgba(15, 23, 42, 0.2);
	}

	.loft-gate__icon {
		display: grid;
		place-items: center;
		width: 56px;
		height: 56px;
		margin: 0 auto 1rem;
		border-radius: 999px;
		background: #e0f2fe;
		color: #0ea5e9;
	}

	h2 {
		margin: 0 0 0.5rem;
		font-size: 1.25rem;
		color: #0f172a;
	}

	p {
		margin: 0 0 0.75rem;
		font-size: 0.95rem;
		line-height: 1.5;
		color: #475569;
	}

	.loft-gate__note {
		font-size: 0.85rem;
		color: #64748b;
	}

	.loft-gate__warning {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		text-align: left;
		font-size: 0.85rem;
		color: #92400e;
		background: #fffbeb;
		border: 1px solid #fde68a;
		border-radius: 0.75rem;
		padding: 0.65rem 0.75rem;
	}

	.loft-gate__actions {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 1.25rem;
	}

	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.7rem 1.25rem;
		border-radius: 999px;
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.18s cubic-bezier(0.22, 1, 0.36, 1);
	}

	button:disabled {
		opacity: 0.65;
		cursor: not-allowed;
	}

	.loft-gate__primary {
		border: none;
		background: #0ea5e9;
		color: #ffffff;
	}

	.loft-gate__primary:hover:not(:disabled) {
		background: #0284c7;
	}

	.loft-gate__secondary {
		border: 1px solid #cbd5e1;
		background: transparent;
		color: #475569;
	}

	.loft-gate__secondary:hover:not(:disabled) {
		background: #f1f5f9;
	}

	.loft-gate__error {
		margin: 1rem 0 0;
		font-size: 0.85rem;
		color: #b91c1c;
	}

	:global(.loft-gate__spinner) {
		animation: loft-gate-spin 1s linear infinite;
	}

	@keyframes loft-gate-spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (max-width: 640px) {
		.loft-gate__panel {
			padding: 1.5rem;
		}
	}
</style>
