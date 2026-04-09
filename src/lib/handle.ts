export function normalize_handle(value: unknown): string {
	if (typeof value !== 'string') {
		return '';
	}

	return value.trim().replace(/^@+/, '');
}
