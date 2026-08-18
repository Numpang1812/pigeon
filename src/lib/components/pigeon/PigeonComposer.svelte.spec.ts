import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import PigeonComposer from './PigeonComposer.svelte';

/**
 * The composer is where the flock constraint becomes something a user feels, so
 * each locked state has to explain itself rather than fail silently or show a
 * generic error.
 */

const server_now = Date.UTC(2026, 7, 17, 12, 0, 0);

const ready_props = {
	conversation_id: 'conversation_1',
	can_send: true,
	block_reason: null,
	pigeons_available: 7,
	server_now
};

describe('PigeonComposer.svelte', () => {
	it('offers a textarea when a pigeon is available', async () => {
		render(PigeonComposer, ready_props);

		await expect.element(page.getByRole('textbox')).toBeInTheDocument();
	});

	it('states the distance and flight time before a bird is spent', async () => {
		render(PigeonComposer, {
			...ready_props,
			nearest_distance_km: 4350,
			nearest_flight_ms: 54.4 * 3_600_000
		});

		await expect.element(page.getByText(/4,350 km/)).toBeInTheDocument();
		await expect.element(page.getByText(/arrives in about 2d/)).toBeInTheDocument();
	});

	it('locks with a countdown when every pigeon is out', async () => {
		const { container } = render(PigeonComposer, {
			...ready_props,
			pigeons_available: 0,
			next_available_at_ms: server_now + 4 * 3_600_000
		});

		await expect.element(page.getByText(/All your pigeons are out/)).toBeInTheDocument();
		await expect.element(page.getByText(/next one lands in 4h/)).toBeInTheDocument();
		// No way to type at all: the constraint is hard, not advisory.
		expect(container.querySelector('textarea')).toBeNull();
	});

	it('explains a broken mutual follow and still implies history is readable', async () => {
		render(PigeonComposer, {
			...ready_props,
			can_send: false,
			block_reason: 'not_mutual_follow'
		});

		await expect.element(page.getByText(/follow you back/)).toBeInTheDocument();
		await expect.element(page.getByText(/still read everything here/)).toBeInTheDocument();
	});

	it('points a user with no loft at setting one', async () => {
		const { container } = render(PigeonComposer, {
			...ready_props,
			can_send: false,
			block_reason: 'sender_home_unset'
		});

		await expect.element(page.getByText(/Set your home loft/)).toBeInTheDocument();
		expect(container.querySelector('textarea')).toBeNull();
	});

	it('keeps send disabled while the message is empty', async () => {
		const { container } = render(PigeonComposer, ready_props);

		const send_button = container.querySelector('.composer-send');
		expect(send_button).not.toBeNull();
		expect(send_button?.hasAttribute('disabled')).toBe(true);
	});

	it('has no read receipt and no typing indicator', async () => {
		const { container } = render(PigeonComposer, ready_props);

		expect(container.textContent).not.toMatch(/seen|read receipt|typing/i);
	});
});
