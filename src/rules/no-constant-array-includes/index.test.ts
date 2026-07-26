import { dedent } from 'ts-dedent';
import mod from '.';
import { runTest } from '@test/run-test';

runTest({
  module: mod,
  valid: [
    // Set.has is fine
    'VALID_OPTIONS.has(x)',
    // Dynamic array from function call
    'getItems().includes(x)',
    // Inline array but not .includes
    '[\'a\', \'b\'].indexOf(x)',
    // Inline array with .map (not .includes)
    '[\'a\', \'b\'].map(x => x.toUpperCase())',
    // Non-array const variable
    'const s = "abc"; s.includes("a")',
    // Const variable initialized from function
    'const arr = getItems(); arr.includes(x)'
  ],
  invalid: [
    // Basic inline array includes
    {
      code: '[\'a\', \'b\', \'c\'].includes(x)',
      errors: [{ messageId: 'default' }]
    },
    // Numeric array
    {
      code: '[1, 2, 3].includes(x)',
      errors: [{ messageId: 'default' }]
    },
    // Single element
    {
      code: '[\'a\'].includes(x)',
      errors: [{ messageId: 'default' }]
    },
    // Negated
    {
      code: '![\'a\', \'b\'].includes(x)',
      errors: [{ messageId: 'default' }]
    },
    // Used in condition
    {
      code: 'if ([\'foo\', \'bar\'].includes(type)) {}',
      errors: [{ messageId: 'default' }]
    },
    // Inside function
    {
      code: 'function test(x) { return [\'a\', \'b\'].includes(x); }',
      errors: [{ messageId: 'default' }]
    },
    // Mixed types
    {
      code: '[\'a\', 1, null].includes(x)',
      errors: [{ messageId: 'default' }]
    },
    // As TypeScript const assertion
    {
      code: '([\'a\', \'b\'] as const).includes(x)',
      errors: [{ messageId: 'default' }]
    },
    // Const variable referencing array literal
    {
      code: dedent`
        const VALID_OPTIONS = ['a', 'b', 'c'];
        VALID_OPTIONS.includes(x);
      `,
      errors: [{ messageId: 'default' }]
    },
    // Const variable with as const
    {
      code: dedent`
        const ITEMS = ['foo', 'bar'] as const;
        ITEMS.includes(x);
      `,
      errors: [{ messageId: 'default' }]
    },
    // Const variable used in function
    {
      code: dedent`
        const ALLOWED = [1, 2, 3];
        function check(x) { return ALLOWED.includes(x); }
      `,
      errors: [{ messageId: 'default' }]
    },
    // Const variable with satisfies
    {
      code: dedent`
        const ITEMS = ['a', 'b'] satisfies string[];
        ITEMS.includes(x);
      `,
      errors: [{ messageId: 'default' }]
    },
    // let variable with static array value
    {
      code: 'let arr = [1, 2]; arr.includes(x)',
      errors: [{ messageId: 'default' }]
    }
  ]
}, {}, false);
