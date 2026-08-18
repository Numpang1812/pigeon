import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import MessageBubble from './MessageBubble.svelte';

const sender = {
	id: 'user_b',
	name: 'Bee',
	handle: 'bee',
	avatar: '',
	verified: true
};

// A fixed clock, so ETA assertions do not drift with the wall clock.
const server_now = Date.UTC(2026, 7, 17, 12, 0, 0);

describe('MessageBubble.svelte', () => {
	it('renders a received message with its sender', async () => {
		render(MessageBubble, {
			body: 'The pigeon landed',
			is_own: false,
			visible_at: '2026-08-17 09:00:00.000',
			sender,
			server_now
		});

		await expect.element(page.getByText('The pigeon landed')).toBeInTheDocument();
		await expect.element(page.getByText('Bee')).toBeInTheDocument();
		await expect.element(page.getByText('@bee')).toBeInTheDocument();
	});

	it('marks an own message so it can be aligned and coloured differently', async () => {
		const { container } = render(MessageBubble, {
			body: 'Still flying',
			is_own: true,
			visible_at: '2026-08-17 09:00:00.000',
			sender: null,
			server_now
		});

		expect(container.querySelector('.bubble-row--own')).not.toBeNull();
		expect(container.querySelector('.bubble--own')).not.toBeNull();
	});

	it('does not render a sender header on an own message', async () => {
		const { container } = render(MessageBubble, {
			body: 'Still flying',
			is_own: true,
			visible_at: '2026-08-17 09:00:00.000',
			sender,
			server_now
		});

		expect(container.querySelector('.bubble-sender')).toBeNull();
	});

	it('renders one thumbnail per attachment', async () => {
		const { container } = render(MessageBubble, {
			body: '',
			is_own: false,
			visible_at: '2026-08-17 09:00:00.000',
			sender,
			attachments: [
				{ url: 'https://res.cloudinary.com/demo/image/upload/a.jpg', media_type: 'image' },
				{ url: 'https://res.cloudinary.com/demo/image/upload/b.jpg', media_type: 'image' }
			],
			server_now
		});

		expect(container.querySelectorAll('.bubble-attachments img')).toHaveLength(2);
	});

	it('tells the sender where their bird is while it is still flying', async () => {
		render(MessageBubble, {
			body: 'On its way',
			is_own: true,
			visible_at: '2026-08-17 09:00:00.000',
			sender: null,
			deliveries: [
				{ recipient_id: 'user_b', deliver_at: '2026-08-19 12:00:00.000', cancelled_at: null }
			],
			server_now,
			recipient_names: { user_b: 'Bee' }
		});

		// 48 hours out from the fixed clock.
		await expect.element(page.getByText(/reaches Bee in 2d/)).toBeInTheDocument();
	});

	it('reports a recalled message rather than pretending it arrived', async () => {
		render(MessageBubble, {
			body: 'Never mind',
			is_own: true,
			visible_at: '2026-08-17 09:00:00.000',
			sender: null,
			deliveries: [
				{
					recipient_id: 'user_b',
					deliver_at: '2026-08-19 12:00:00.000',
					cancelled_at: '2026-08-17 10:00:00.000'
				}
			],
			server_now
		});

		await expect.element(page.getByText('Recalled before it arrived')).toBeInTheDocument();
	});

	it('shows a timestamp once a delivered message has landed', async () => {
		const { container } = render(MessageBubble, {
			body: 'Arrived safely',
			is_own: false,
			visible_at: '2026-08-17 09:00:00.000',
			sender,
			server_now
		});

		expect(container.querySelector('time')).not.toBeNull();
	});

	it('has no read receipt and no typing indicator', async () => {
		// Both were explicitly excluded from v1. This locks that in so neither
		// reappears by accident.
		const { container } = render(MessageBubble, {
			body: 'Arrived safely',
			is_own: true,
			visible_at: '2026-08-17 09:00:00.000',
			sender: null,
			deliveries: [
				{ recipient_id: 'user_b', deliver_at: '2026-08-17 08:00:00.000', cancelled_at: null }
			],
			server_now
		});

		expect(container.textContent).not.toMatch(/seen|read receipt|typing/i);
	});
});
