export const code_quality_rules = {
	'no-undef': 'off',
	'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
	'no-var': 'error',
	'no-debugger': 'error',
	'prefer-const': 'error',
	complexity: ['error', 15],
	'max-depth': ['error', 3]
};
