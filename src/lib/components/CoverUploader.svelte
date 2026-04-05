<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import imageCompression from 'browser-image-compression';
	import { X, Upload, AlertCircle, Check } from 'lucide-svelte';

	interface CoverUploaderProps {
		current_cover_url?: string | null;
		on_success?: (new_url: string) => void;
		on_close?: () => void;
	}

	const props: CoverUploaderProps = $props();
	const dispatch = createEventDispatcher();

	// State
	let is_uploading = $state(false);
	let is_compressing = $state(false);
	let error = $state<string | null>(null);
	let success = $state(false);
	let preview_url = $state<string | null>(null);
	let compression_info = $state<{
		original_size: number;
		compressed_size: number;
		reduction: number;
	} | null>(null);

	// Compression settings - wider for cover photos
	const compression_options = {
		maxSizeMB: 2,              // Target 1-2MB after compression
		maxWidthOrHeight: 1920,    // Max dimension for cover photos (wide)
		useWebWorker: true,        // Don't block UI thread
		fileType: 'image/jpeg',    // Always output JPEG for consistency
		initialQuality: 0.8,       // Start with 80% quality
		maxIteration: 3,           // Max compression iterations
		preserveExif: false        // Remove metadata to save space
	};

	const max_file_size = 10 * 1024 * 1024; // 10MB before compression
	const allowed_types = ['image/jpeg', 'image/png', 'image/webp'];

	// ==========================================
	// File Selection
	// ==========================================

	async function handle_file_select(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) return;

		// Reset state
		error = null;
		success = false;
		compression_info = null;

		// Validate file type
		if (!allowed_types.includes(file.type)) {
			error = `Invalid file type. Please select JPEG, PNG, or WebP`;
			return;
		}

		// Validate file size (10MB limit before compression)
		if (file.size > max_file_size) {
			error = `File too large. Maximum size is ${max_file_size / 1024 / 1024}MB`;
			return;
		}

		// Create preview
		preview_url = URL.createObjectURL(file);

		// Show original size
		compression_info = {
			original_size: file.size,
			compressed_size: file.size,
			reduction: 0
		};

		// Compress the image
		await compress_and_upload(file);
	}

	// ==========================================
	// Image Compression
	// ==========================================

	async function compress_and_upload(file: File) {
		is_compressing = true;
		error = null;

		try {
			// Only compress if file is larger than 500KB
			if (file.size > 500 * 1024) {
				console.info(`Compressing image: ${(file.size / 1024).toFixed(2)}KB`);

				const compressed_file = await imageCompression(file, compression_options);

				console.info(`Compressed to: ${(compressed_file.size / 1024).toFixed(2)}KB`);

				// Update compression info
				compression_info = {
					original_size: file.size,
					compressed_size: compressed_file.size,
					reduction: Number(((1 - compressed_file.size / file.size) * 100).toFixed(1))
				};

				// Update preview to compressed version
				if (preview_url) {
					URL.revokeObjectURL(preview_url);
				}
				preview_url = URL.createObjectURL(compressed_file);

				// Upload compressed file
				await upload_file(compressed_file);
			} else {
				// File is small enough, skip compression
				compression_info = {
					original_size: file.size,
					compressed_size: file.size,
					reduction: 0
				};
				await upload_file(file);
			}
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			console.error('Compression error:', err);
			error = `Failed to compress image: ${message}`;
		} finally {
			is_compressing = false;
		}
	}

	// ==========================================
	// Upload to Server
	// ==========================================

	async function upload_file(file: File) {
		is_uploading = true;
		error = null;

		try {
			// Create form data
			const form_data = new FormData();
			form_data.append('file', file);

			// Upload to server
			const response = await fetch('/api/upload-cover', {
				method: 'POST',
				body: form_data
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.body?.message || result.message || 'Upload failed');
			}

			// Success!
			success = true;

			// Notify parent component
			if (props.on_success) {
				props.on_success(result.imageUrl);
			}

			dispatch('upload-success', { url: result.imageUrl });

			// Auto-close after 2 seconds
			setTimeout(() => {
				if (props.on_close) {
					props.on_close();
				}
			}, 2000);

		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			console.error('Upload error:', err);
			error = `Failed to upload: ${message}`;
			success = false;
		} finally {
			is_uploading = false;
		}
	}

	// ==========================================
	// Cancel Upload
	// ==========================================

	function cancel() {
		if (preview_url) {
			URL.revokeObjectURL(preview_url);
		}
		preview_url = null;
		compression_info = null;
		error = null;
		success = false;

		if (props.on_close) {
			props.on_close();
		}
	}

	// ==========================================
	// Helper Functions
	// ==========================================

	function format_file_size(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	}
</script>

<div class="cover-uploader" class:uploading={is_uploading}>
	<!-- Header -->
	<div class="header">
		<h3>Change Cover Photo</h3>
		<button class="close-btn" onclick={cancel} aria-label="Close">
			<X size={20} />
		</button>
	</div>

	<!-- Current Cover (if exists) -->
	{#if props.current_cover_url && !preview_url}
		<div class="current-cover">
			<p class="label">Current Cover</p>
			<img src={props.current_cover_url} alt="Current cover" />
		</div>
	{/if}

	<!-- Preview Area -->
	{#if preview_url}
		<div class="preview-area">
			<p class="label">New Cover Preview</p>
			<img src={preview_url} alt="Preview" class:compressing={is_compressing} />

			<!-- Compression Info -->
			{#if compression_info && compression_info.reduction > 0}
				<div class="compression-info">
					<div class="size-comparison">
						<span class="original">{format_file_size(compression_info.original_size)}</span>
						<span class="arrow">→</span>
						<span class="compressed">{format_file_size(compression_info.compressed_size)}</span>
					</div>
					<p class="reduction">
						<Check size={14} />
						Reduced by {compression_info.reduction}%
					</p>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Error Message -->
	{#if error}
		<div class="error-message">
			<AlertCircle size={18} />
			<p>{error}</p>
		</div>
	{/if}

	<!-- Success Message -->
	{#if success}
		<div class="success-message">
			<Check size={18} />
			<p>Cover updated successfully!</p>
		</div>
	{/if}

	<!-- Upload Button -->
	<div class="upload-area">
		<label class="upload-btn" class:disabled={is_uploading || is_compressing}>
			<Upload size={20} />
			<span>
				{#if is_compressing}
					Compressing...
				{:else if is_uploading}
					Uploading...
				{:else}
					Choose Image
				{/if}
			</span>
			<input
				type="file"
				accept="image/jpeg,image/png,image/webp"
				onchange={handle_file_select}
				disabled={is_uploading || is_compressing}
			/>
		</label>
		<p class="hint">
			Max 10MB • Auto-compressed • JPEG, PNG, WebP
		</p>
	</div>
</div>

<style>
	.cover-uploader {
		background: white;
		border-radius: 16px;
		padding: 24px;
		max-width: 500px;
		width: 100%;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 20px;
	}

	.header h3 {
		margin: 0;
		font-size: 20px;
		font-weight: 700;
		color: #14171A;
	}

	.close-btn {
		background: none;
		border: none;
		cursor: pointer;
		padding: 4px;
		color: #657786;
		transition: color 0.2s;
	}

	.close-btn:hover {
		color: #14171A;
	}

	.current-cover,
	.preview-area {
		text-align: center;
		margin-bottom: 20px;
	}

	.label {
		font-size: 14px;
		font-weight: 600;
		color: #657786;
		margin-bottom: 12px;
	}

	.current-cover img,
	.preview-area img {
		width: 100%;
		max-width: 450px;
		height: 200px;
		border-radius: 12px;
		object-fit: cover;
		border: 4px solid #E1E8ED;
	}

	.preview-area img.compressing {
		opacity: 0.6;
	}

	.compression-info {
		margin-top: 12px;
		padding: 12px;
		background: #F5F8FA;
		border-radius: 8px;
	}

	.size-comparison {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		font-size: 14px;
		font-weight: 600;
	}

	.original {
		color: #657786;
		text-decoration: line-through;
	}

	.arrow {
		color: #1DA1F2;
	}

	.compressed {
		color: #17BF63;
	}

	.reduction {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		margin: 8px 0 0 0;
		font-size: 13px;
		color: #17BF63;
		font-weight: 600;
	}

	.error-message,
	.success-message {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px;
		border-radius: 8px;
		margin-bottom: 16px;
	}

	.error-message {
		background: #FEE;
		color: #E0245E;
	}

	.success-message {
		background: #E8F5E9;
		color: #17BF63;
	}

	.error-message p,
	.success-message p {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
	}

	.upload-area {
		text-align: center;
	}

	.upload-btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 12px 24px;
		background: #1DA1F2;
		color: white;
		border-radius: 9999px;
		cursor: pointer;
		font-weight: 700;
		font-size: 15px;
		transition: background 0.2s;
	}

	.upload-btn:hover:not(.disabled) {
		background: #1A91DA;
	}

	.upload-btn.disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.upload-btn input[type='file'] {
		display: none;
	}

	.hint {
		margin: 12px 0 0 0;
		font-size: 13px;
		color: #657786;
	}

	.uploading {
		pointer-events: none;
	}
</style>
