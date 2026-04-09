<script lang="ts">
	import imageCompression from 'browser-image-compression';
	import { Upload, Check, X, Download } from 'lucide-svelte';

	// State
	let original_file = $state<File | null>(null);
	let compressed_file = $state<File | null>(null);
	let original_preview = $state<string | null>(null);
	let compressed_preview = $state<string | null>(null);
	let is_compressing = $state(false);
	let error = $state<string | null>(null);

	const compression_options = {
		maxSizeMB: 2,
		maxWidthOrHeight: 1024,
		useWebWorker: true,
		fileType: 'image/jpeg',
		initialQuality: 0.8,
		maxIteration: 3,
		preserveExif: false
	};

	async function handle_file_select(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) return;

		// Validate
		if (!file.type.startsWith('image/')) {
			error = 'Please select an image file';
			return;
		}

		if (file.size > 10 * 1024 * 1024) {
			error = 'File too large. Max 10MB';
			return;
		}

		original_file = file;
		compressed_file = null;
		error = null;

		// Create original preview
		if (original_preview) {
			URL.revokeObjectURL(original_preview);
		}
		original_preview = URL.createObjectURL(file);

		// Compress
		await compress_image(file);
	}

	async function compress_image(file: File) {
		is_compressing = true;
		error = null;

		try {
			console.info('Original size:', (file.size / 1024).toFixed(2), 'KB');

			compressed_file = await imageCompression(file, compression_options);

			console.info('Compressed size:', (compressed_file.size / 1024).toFixed(2), 'KB');

			// Create compressed preview
			if (compressed_preview) {
				URL.revokeObjectURL(compressed_preview);
			}
			compressed_preview = URL.createObjectURL(compressed_file);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			console.error('Compression error:', err);
			error = `Compression failed: ${message}`;
		} finally {
			is_compressing = false;
		}
	}

	function format_size(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
	}

	function get_reduction(): number {
		if (!original_file || !compressed_file) return 0;
		return (1 - compressed_file.size / original_file.size) * 100;
	}

	function download_compressed() {
		if (!compressed_file) return;

		const url = URL.createObjectURL(compressed_file);
		const a = document.createElement('a');
		a.href = url;
		a.download = `compressed_${original_file?.name || 'image.jpg'}`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head>
	<title>Test Image Compression · Pigeon</title>
</svelte:head>

<div class="container">
	<h1>🗜️ Image Compression Test</h1>
	<p class="subtitle">Upload an image to test the compression before saving to S3</p>

	<!-- Upload Area -->
	<div class="upload-section">
		<label class="upload-btn">
			<Upload size={24} />
			<span>Select Image</span>
			<input type="file" accept="image/*" onchange={handle_file_select} />
		</label>
	</div>

	<!-- Error -->
	{#if error}
		<div class="error-box">
			<X size={20} />
			<p>{error}</p>
		</div>
	{/if}

	<!-- Compression Settings -->
	<div class="settings-box">
		<h3>Compression Settings</h3>
		<div class="setting">
			<span class="label">Max Size:</span>
			<span class="value">2 MB</span>
		</div>
		<div class="setting">
			<span class="label">Max Dimension:</span>
			<span class="value">1024px</span>
		</div>
		<div class="setting">
			<span class="label">Quality:</span>
			<span class="value">80%</span>
		</div>
		<div class="setting">
			<span class="label">Output:</span>
			<span class="value">JPEG</span>
		</div>
	</div>

	<!-- Results -->
	{#if original_file}
		<div class="results">
			<h2>Results</h2>

			<div class="comparison">
				<!-- Original -->
				<div class="image-card">
					<h3>Original</h3>
					{#if original_preview}
						<img src={original_preview} alt="Original" />
					{/if}
					<div class="info">
						<p class="filename">{original_file.name}</p>
						<p class="size">{format_size(original_file.size)}</p>
					</div>
				</div>

				<!-- Arrow -->
				<div class="arrow-section">
					{#if is_compressing}
						<div class="loading">Compressing...</div>
					{:else if compressed_file}
						<div class="success-badge">
							<Check size={24} />
							<p>{get_reduction().toFixed(1)}% reduction</p>
						</div>
					{/if}
				</div>

				<!-- Compressed -->
				{#if compressed_file}
					<div class="image-card">
						<h3>Compressed</h3>
						{#if compressed_preview}
							<img src={compressed_preview} alt="Compressed" />
						{/if}
						<div class="info">
							<p class="filename">compressed_{original_file.name}</p>
							<p class="size compressed">{format_size(compressed_file.size)}</p>
							<button class="download-btn" onclick={download_compressed}>
								<Download size={16} />
								<span>Download</span>
							</button>
						</div>
					</div>
				{/if}
			</div>

			<!-- Quality Assessment -->
			{#if compressed_file}
				<div class="quality-box">
					<h3>✅ Quality Assessment</h3>
					{#if get_reduction() > 70}
						<p class="excellent">
							<strong>Excellent compression!</strong> File size reduced by {get_reduction().toFixed(
								1
							)}%. Suitable for fast uploads with minimal quality loss.
						</p>
					{:else if get_reduction() > 50}
						<p class="good">
							<strong>Good compression.</strong> File size reduced by {get_reduction().toFixed(1)}%.
							Good balance between quality and size.
						</p>
					{:else}
						<p class="moderate">
							<strong>Moderate compression.</strong> File size reduced by {get_reduction().toFixed(
								1
							)}%. Image was already small or optimized.
						</p>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	:global(body) {
		background: #f5f8fa;
	}

	.container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 40px 20px;
		font-family:
			'Inter',
			system-ui,
			-apple-system,
			sans-serif;
	}

	h1 {
		font-size: 32px;
		font-weight: 800;
		color: #14171a;
		margin: 0 0 8px 0;
	}

	.subtitle {
		font-size: 16px;
		color: #657786;
		margin: 0 0 32px 0;
	}

	.upload-section {
		margin-bottom: 24px;
	}

	.upload-btn {
		display: inline-flex;
		align-items: center;
		gap: 12px;
		padding: 16px 32px;
		background: #1da1f2;
		color: white;
		border-radius: 9999px;
		cursor: pointer;
		font-weight: 700;
		font-size: 16px;
		transition: background 0.2s;
	}

	.upload-btn:hover {
		background: #1a91da;
	}

	.upload-btn input[type='file'] {
		display: none;
	}

	.error-box {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px;
		background: #fee;
		color: #e0245e;
		border-radius: 8px;
		margin-bottom: 24px;
	}

	.error-box p {
		margin: 0;
		font-weight: 600;
	}

	.settings-box {
		background: white;
		padding: 20px;
		border-radius: 12px;
		margin-bottom: 32px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.settings-box h3 {
		margin: 0 0 16px 0;
		font-size: 18px;
		font-weight: 700;
	}

	.setting {
		display: flex;
		justify-content: space-between;
		padding: 8px 0;
		border-bottom: 1px solid #e1e8ed;
	}

	.setting:last-child {
		border-bottom: none;
	}

	.setting .label {
		color: #657786;
		font-weight: 500;
	}

	.setting .value {
		color: #14171a;
		font-weight: 700;
	}

	.results {
		margin-top: 32px;
	}

	.results h2 {
		font-size: 24px;
		font-weight: 700;
		margin: 0 0 24px 0;
	}

	.comparison {
		display: flex;
		align-items: center;
		gap: 24px;
		justify-content: center;
	}

	.image-card {
		background: white;
		padding: 20px;
		border-radius: 12px;
		text-align: center;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		min-width: 300px;
	}

	.image-card h3 {
		margin: 0 0 16px 0;
		font-size: 18px;
		font-weight: 700;
	}

	.image-card img {
		width: 280px;
		height: 280px;
		object-fit: cover;
		border-radius: 8px;
		margin-bottom: 16px;
	}

	.image-card .info {
		text-align: left;
	}

	.filename {
		font-size: 14px;
		color: #657786;
		margin: 0 0 4px 0;
		word-break: break-all;
	}

	.size {
		font-size: 20px;
		font-weight: 700;
		color: #14171a;
		margin: 0 0 12px 0;
	}

	.size.compressed {
		color: #17bf63;
	}

	.arrow-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 150px;
	}

	.loading {
		font-size: 18px;
		font-weight: 700;
		color: #657786;
	}

	.success-badge {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 20px;
		background: #e8f5e9;
		border-radius: 12px;
		color: #17bf63;
	}

	.success-badge p {
		margin: 0;
		font-size: 18px;
		font-weight: 700;
	}

	.download-btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 10px 20px;
		background: #1da1f2;
		color: white;
		border: none;
		border-radius: 9999px;
		cursor: pointer;
		font-weight: 700;
		font-size: 14px;
		transition: background 0.2s;
		width: 100%;
		justify-content: center;
	}

	.download-btn:hover {
		background: #1a91da;
	}

	.quality-box {
		margin-top: 32px;
		padding: 24px;
		background: white;
		border-radius: 12px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.quality-box h3 {
		margin: 0 0 16px 0;
		font-size: 20px;
		font-weight: 700;
	}

	.quality-box p {
		margin: 0;
		font-size: 16px;
		line-height: 1.5;
	}

	.excellent {
		color: #17bf63 !important;
	}

	.good {
		color: #1da1f2 !important;
	}

	.moderate {
		color: #657786 !important;
	}

	@media (max-width: 900px) {
		.comparison {
			flex-direction: column;
		}

		.image-card {
			min-width: 100%;
		}
	}
</style>
