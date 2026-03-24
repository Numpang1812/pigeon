// import { types } from 'node:util';

export const naming_convention_rules = {
	'@typescript-eslint/naming-convention': [
		'warn',
		{
			selector: 'variable',
			format: ['snake_case']
		},

		{
			selector: 'function',
			format: ['snake_case']
		}

		// {
		//     selector: 'variable',
		//     types: ['boolean'],
		//     format: ['snake_case'],
		//     prefix: ['is_', 'has_', 'should_', 'can_', 'will_', 'did_']

		// },
	]
};
