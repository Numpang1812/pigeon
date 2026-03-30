import { code_quality_rules } from './code-quality.ts';
import { naming_convention_rules } from './naming-convention.ts';

export const all_rules = {
	...code_quality_rules,
	...naming_convention_rules
};
