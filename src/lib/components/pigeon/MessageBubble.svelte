<script lang="ts">
	import { BadgeCheck } from 'lucide-svelte';
	import { epoch_from_sql, format_duration } from '$lib/pigeon/clock';

	type Sender = {
		id: string;
		name: string;
		handle: string;
		avatar: string;
		verified: boolean;
	};

	type Delivery = {
		recipient_id: string;
		deliver_at: string;
		cancelled_at: string | null;
	};

	type Props = {
		body: string;
		is_own: boolean;
		visible_at: string;
		sender: Sender | null;
		attachments?: { url: string; media_type: string }[];
		/** Own messages only: per-recipient arrivals, used for the in-flight note. */
		deliveries?: Delivery[];
		/** Server-corrected clock, so ETAs do not drift with a wrong browser clock. */
		server_now: number;
		recipient_names?: Record<string, string>;
	};

	const {
		body,
		is_own,
		visible_at,
		sender,
		attachments = [],
		deliveries = [],
		server_now,
		recipient_names = {}
	}: Props = $props();

	const visible_at_ms = $derived(epoch_from_sql(visible_at));

	/** Recipients this message has not reached yet, soonest first. */
	const in_flight = $derived(
		deliveries
			.filter((delivery) => {
				if (delivery.cancelled_at) return false;
				const deliver_at_ms = epoch_from_sql(delivery.deliver_at);
				return deliver_at_ms !== null && deliver_at_ms > server_now;
			})
			.sort((a, b) => (a.deliver_at < b.deliver_at ? -1 : 1))
	);

	const cancelled = $derived(deliveries.filter((delivery) => delivery.cancelled_at !== null));

	function eta_for(delivery: Delivery): string {
		const deliver_at_ms = epoch_from_sql(delivery.deliver_at);
		if (deliver_at_ms === null) return '';

		return format_duration(deliver_at_ms - server_now);
	}

	function name_for(recipient_id: string): string {
		return recipient_names[recipient_id] ?? 'their loft';
	}
</script>

<article class="bubble-row" class:bubble-row--own={is_own}>
	{#if !is_own}
		<img
			class="bubble-avatar"
			src={sender?.avatar || '/default-avatar.svg'}
			alt={sender?.name ?? 'Unknown sender'}
		/>
	{/if}

	<div class="bubble-column">
		{#if !is_own && sender}
			<p class="bubble-sender">
				{sender.name}
				{#if sender.verified}
					<BadgeCheck size={14} fill="#0ea5e9" color="white" />
				{/if}
				<span class="bubble-handle">@{sender.handle}</span>
			</p>
		{/if}

		<div class="bubble" class:bubble--own={is_own}>
			{#if body}
				<p class="bubble-body">{body}</p>
			{/if}

			{#if attachments.length > 0}
				<div class="bubble-attachments" class:bubble-attachments--multiple={attachments.length > 1}>
					{#each attachments as attachment (attachment.url)}
						<img src={attachment.url} alt="Attachment carried by pigeon" loading="lazy" />
					{/each}
				</div>
			{/if}
		</div>

		<p class="bubble-meta">
			{#if is_own && in_flight.length > 0}
				<!-- The sender sees their own message immediately, with where the bird is. -->
				<span class="bubble-flying">
					In flight · reaches {name_for(in_flight[0].recipient_id)} in {eta_for(in_flight[0])}
					{#if in_flight.length > 1}
						· {in_flight.length - 1} more stop{in_flight.length > 2 ? 's' : ''} after
					{/if}
				</span>
			{:else if is_own && cancelled.length > 0 && in_flight.length === 0}
				<span class="bubble-recalled">Recalled before it arrived</span>
			{:else if visible_at_ms !== null}
				<time datetime={visible_at}>
					{new Date(visible_at_ms).toLocaleString('en-US', {
						month: 'short',
						day: 'numeric',
						hour: 'numeric',
						minute: '2-digit'
					})}
				</time>
			{/if}
		</p>
	</div>
</article>

<style>
	.bubble-row {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		max-width: 78%;
	}

	.bubble-row--own {
		margin-left: auto;
		justify-content: flex-end;
	}

	.bubble-avatar {
		width: 32px;
		height: 32px;
		border-radius: 999px;
		object-fit: cover;
		flex-shrink: 0;
		margin-top: 1.35rem;
	}

	.bubble-column {
		min-width: 0;
	}

	.bubble-sender {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		margin: 0 0 0.2rem;
		font-size: 0.8rem;
		font-weight: 600;
		color: #0f172a;
	}

	.bubble-handle {
		font-weight: 400;
		color: #64748b;
	}

	.bubble {
		padding: 0.6rem 0.85rem;
		border-radius: 16px;
		background: #f1f5f9;
		color: #0f172a;
	}

	.bubble--own {
		background: #0ea5e9;
		color: #ffffff;
	}

	.bubble-body {
		margin: 0;
		font-size: 0.92rem;
		line-height: 1.5;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.bubble-attachments {
		display: grid;
		gap: 0.35rem;
		margin-top: 0.5rem;
	}

	.bubble-attachments--multiple {
		grid-template-columns: 1fr 1fr;
	}

	.bubble-attachments img {
		width: 100%;
		max-height: 260px;
		border-radius: 12px;
		object-fit: cover;
	}

	.bubble-meta {
		margin: 0.25rem 0 0;
		font-size: 0.72rem;
		color: #64748b;
	}

	.bubble-row--own .bubble-meta {
		text-align: right;
	}

	.bubble-flying {
		color: #0284c7;
		font-weight: 600;
	}

	.bubble-recalled {
		color: #b91c1c;
		font-weight: 600;
	}

	@media (max-width: 640px) {
		.bubble-row {
			max-width: 90%;
		}
	}
</style>
