<script lang="ts">
	import { Send, LoaderCircle, ImagePlus, X } from 'lucide-svelte';
	import imageCompression from 'browser-image-compression';
	import { format_distance, format_duration } from '$lib/pigeon/clock';

	type UploadedAttachment = {
		url: string;
		key: string;
		media_type: string;
		byte_size: number | null;
		file_name: string | null;
	};

	type PendingUpload = {
		id: string;
		preview_url: string;
		uploading: boolean;
		error: string | null;
		uploaded: UploadedAttachment | null;
	};

	type Props = {
		conversation_id: string;
		/** False when the composer must be locked; block_reason says why. */
		can_send: boolean;
		block_reason?: string | null;
		/** Pigeons currently out, and the flock size, for the empty-coop state. */
		pigeons_available: number;
		next_available_at_ms?: number | null;
		/** Distance and flight time to the nearest recipient, shown before sending. */
		nearest_distance_km?: number | null;
		nearest_flight_ms?: number | null;
		nearest_label?: string | null;
		server_now: number;
		on_sent?: () => void;
		on_needs_location?: () => void;
	};

	const {
		conversation_id,
		can_send,
		block_reason = null,
		pigeons_available,
		next_available_at_ms = null,
		nearest_distance_km = null,
		nearest_flight_ms = null,
		nearest_label = null,
		server_now,
		on_sent,
		on_needs_location
	}: Props = $props();

	const max_length = 2000;
	const max_attachments = 4;
	const compression_threshold_bytes = 500 * 1024;
	const max_upload_bytes = 10 * 1024 * 1024;

	let body = $state('');
	let sending = $state(false);
	let send_error = $state<string | null>(null);
	let uploads = $state<PendingUpload[]>([]);
	let file_input = $state<HTMLInputElement>();

	const has_no_pigeon = $derived(pigeons_available <= 0);
	const uploading = $derived(uploads.some((upload) => upload.uploading));
	const ready_attachments = $derived(
		uploads
			.map((upload) => upload.uploaded)
			.filter((uploaded): uploaded is UploadedAttachment => uploaded !== null)
	);

	const is_empty = $derived(body.trim().length === 0 && ready_attachments.length === 0);
	const is_locked = $derived(!can_send || has_no_pigeon);
	const can_submit = $derived(!is_locked && !is_empty && !sending && !uploading);

	/** One of four states, each of which needs its own explanation. */
	const locked_message = $derived.by(() => {
		if (block_reason === 'not_mutual_follow') {
			return 'You can only send pigeons to people who follow you back. You can still read everything here.';
		}
		if (block_reason === 'sender_home_unset') {
			return 'Set your home loft before sending — a pigeon needs somewhere to fly from.';
		}
		if (has_no_pigeon) {
			const wait =
				next_available_at_ms === null
					? ''
					: ` The next one lands in ${format_duration(next_available_at_ms - server_now)}.`;
			return `All your pigeons are out.${wait}`;
		}
		return null;
	});

	const cost_hint = $derived.by(() => {
		if (is_locked || nearest_flight_ms === null) return null;

		const where = nearest_label ? `${nearest_label} · ` : '';
		const distance =
			nearest_distance_km === null ? '' : `${format_distance(nearest_distance_km)} · `;

		return `${where}${distance}arrives in about ${format_duration(nearest_flight_ms)}`;
	});

	async function handle_files(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []).slice(0, max_attachments - uploads.length);
		input.value = '';

		for (const file of files) {
			await add_upload(file);
		}
	}

	async function add_upload(file: File) {
		if (file.size > max_upload_bytes) {
			send_error = 'Images must be under 10MB.';
			return;
		}

		const upload: PendingUpload = {
			id: crypto.randomUUID(),
			preview_url: URL.createObjectURL(file),
			uploading: true,
			error: null,
			uploaded: null
		};
		uploads = [...uploads, upload];

		try {
			// GIFs are skipped: compressing one flattens the animation.
			const prepared =
				file.size > compression_threshold_bytes && file.type !== 'image/gif'
					? await imageCompression(file, {
							maxSizeMB: 1,
							maxWidthOrHeight: 1920,
							useWebWorker: true
						})
					: file;

			const form_data = new FormData();
			form_data.append('file', prepared, file.name);

			const response = await fetch('/api/pigeon/attachment', {
				method: 'POST',
				body: form_data
			});

			if (!response.ok) {
				const payload = await response.json().catch(() => null);
				update_upload(upload.id, { uploading: false, error: payload?.error ?? 'upload_failed' });
				return;
			}

			update_upload(upload.id, { uploading: false, uploaded: await response.json() });
		} catch {
			update_upload(upload.id, { uploading: false, error: 'upload_failed' });
		}
	}

	function update_upload(id: string, patch: Partial<PendingUpload>) {
		uploads = uploads.map((upload) => (upload.id === id ? { ...upload, ...patch } : upload));
	}

	function remove_upload(id: string) {
		const target = uploads.find((upload) => upload.id === id);
		if (target) URL.revokeObjectURL(target.preview_url);
		uploads = uploads.filter((upload) => upload.id !== id);
	}

	async function release() {
		if (!can_submit) return;

		sending = true;
		send_error = null;

		try {
			const response = await fetch(`/api/pigeon/conversations/${conversation_id}/send`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ body: body.trim(), attachments: ready_attachments })
			});

			if (!response.ok) {
				const payload = await response.json().catch(() => null);
				send_error = describe_send_error(payload?.error);

				if (payload?.error === 'sender_home_unset') on_needs_location?.();
				return;
			}

			for (const upload of uploads) URL.revokeObjectURL(upload.preview_url);
			body = '';
			uploads = [];
			on_sent?.();
		} catch {
			send_error = 'Could not reach the server. Try again.';
		} finally {
			sending = false;
		}
	}

	function describe_send_error(code: unknown): string {
		if (code === 'no_pigeon_available') return 'All your pigeons are out. Wait for one to land.';
		if (code === 'not_mutual_follow')
			return 'You can only send pigeons to people who follow you back.';
		if (code === 'sender_home_unset') return 'Set your home loft before sending.';
		if (code === 'recipient_home_unset')
			return 'Someone here has not set a loft, so a pigeon cannot reach them.';
		if (code === 'message_too_long') return 'That message is too long.';
		return 'Could not release the pigeon. Try again.';
	}

	function handle_keydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			release();
		}
	}
</script>

<div class="composer">
	{#if locked_message}
		<p class="composer-locked">{locked_message}</p>
	{:else}
		{#if uploads.length > 0}
			<div class="composer-uploads">
				{#each uploads as upload (upload.id)}
					<div class="composer-upload" class:composer-upload--error={upload.error !== null}>
						<img src={upload.preview_url} alt="Attachment preview" />
						{#if upload.uploading}
							<span class="composer-upload-state">
								<LoaderCircle size={14} class="composer-spinner" />
							</span>
						{/if}
						<button
							type="button"
							class="composer-upload-remove"
							aria-label="Remove attachment"
							onclick={() => remove_upload(upload.id)}
						>
							<X size={12} />
						</button>
					</div>
				{/each}
			</div>
		{/if}

		<div class="composer-row">
			<button
				type="button"
				class="composer-attach"
				aria-label="Add an image"
				disabled={uploads.length >= max_attachments || sending}
				onclick={() => file_input?.click()}
			>
				<ImagePlus size={18} />
			</button>

			<input
				bind:this={file_input}
				type="file"
				accept="image/jpeg,image/png,image/webp,image/gif"
				multiple
				hidden
				onchange={handle_files}
			/>

			<textarea
				bind:value={body}
				placeholder="Write carefully — this pigeon takes a while."
				maxlength={max_length}
				rows={2}
				disabled={sending}
				onkeydown={handle_keydown}
			></textarea>

			<button
				type="button"
				class="composer-send"
				disabled={!can_submit}
				onclick={release}
				aria-label="Release the pigeon"
			>
				{#if sending}
					<LoaderCircle size={18} class="composer-spinner" />
				{:else}
					<Send size={18} />
				{/if}
			</button>
		</div>

		<div class="composer-foot">
			{#if cost_hint}
				<span class="composer-cost">{cost_hint}</span>
			{/if}
			<span class="composer-count" class:composer-count--near={body.length > max_length - 200}>
				{body.length}/{max_length}
			</span>
		</div>
	{/if}

	{#if send_error}
		<p class="composer-error" role="alert">{send_error}</p>
	{/if}
</div>

<style>
	.composer {
		position: sticky;
		bottom: 0;
		padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom));
		border-top: 1px solid #e2e8f0;
		background: #ffffff;
	}

	.composer-locked {
		margin: 0;
		padding: 0.65rem 0.85rem;
		border: 1px solid #cbd5e1;
		border-radius: 12px;
		background: #f8fbff;
		font-size: 0.85rem;
		line-height: 1.5;
		color: #475569;
	}

	.composer-row {
		display: flex;
		align-items: flex-end;
		gap: 0.5rem;
	}

	textarea {
		flex: 1;
		min-height: 44px;
		max-height: 160px;
		padding: 0.6rem 0.75rem;
		border: 1px solid #cbd5e1;
		border-radius: 16px;
		font: inherit;
		font-size: 0.92rem;
		line-height: 1.5;
		resize: vertical;
		color: #0f172a;
	}

	textarea:focus {
		outline: 2px solid #0ea5e9;
		outline-offset: -1px;
	}

	.composer-attach,
	.composer-send {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		border-radius: 999px;
		cursor: pointer;
		flex-shrink: 0;
	}

	.composer-attach {
		border: 1px solid #cbd5e1;
		background: transparent;
		color: #475569;
	}

	.composer-send {
		border: none;
		background: #0ea5e9;
		color: #ffffff;
	}

	.composer-attach:disabled,
	.composer-send:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.composer-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-top: 0.4rem;
		font-size: 0.75rem;
		color: #64748b;
	}

	.composer-cost {
		font-weight: 600;
		color: #0284c7;
	}

	.composer-count--near {
		color: #b91c1c;
	}

	.composer-uploads {
		display: flex;
		gap: 0.4rem;
		margin-bottom: 0.5rem;
		flex-wrap: wrap;
	}

	.composer-upload {
		position: relative;
		width: 64px;
		height: 64px;
		border-radius: 12px;
		overflow: hidden;
		border: 1px solid #cbd5e1;
	}

	.composer-upload--error {
		border-color: #ef4444;
	}

	.composer-upload img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.composer-upload-state {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		background: rgba(15, 23, 42, 0.45);
		color: #ffffff;
	}

	.composer-upload-remove {
		position: absolute;
		top: 2px;
		right: 2px;
		display: grid;
		place-items: center;
		width: 18px;
		height: 18px;
		border: none;
		border-radius: 999px;
		background: rgba(15, 23, 42, 0.7);
		color: #ffffff;
		cursor: pointer;
	}

	.composer-error {
		margin: 0.5rem 0 0;
		font-size: 0.8rem;
		color: #b91c1c;
	}

	:global(.composer-spinner) {
		animation: composer-spin 1s linear infinite;
	}

	@keyframes composer-spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
