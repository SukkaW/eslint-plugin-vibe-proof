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
    'const arr = getItems(); arr.includes(x)',
    // Converting the array to a Set would remove Array.prototype.some.
    dedent`
      const ITEMS = ['a', 'b'];
      ITEMS.includes(x);
      ITEMS.some((item) => item === x);
    `,
    // Any other array method makes whole-variable Set conversion unsafe.
    dedent`
      const ITEMS = ['a', 'b'];
      ITEMS.includes(x);
      ITEMS.map((item) => item.toUpperCase());
    `,
    // Index access requires the value to remain an array.
    dedent`
      const ITEMS = ['a', 'b'];
      ITEMS.includes(x);
      console.log(ITEMS[0]);
    `,
    // Passing the array elsewhere means its required interface is unknown.
    dedent`
      const ITEMS = ['a', 'b'];
      ITEMS.includes(x);
      consume(ITEMS);
    `,
    // Mutations and reassignment are incompatible with replacing the binding.
    dedent`
      const ITEMS = ['a', 'b'];
      ITEMS.push('c');
      ITEMS.includes(x);
    `,
    dedent`
      let items = ['a', 'b'];
      items.includes(x);
      items = ['c'];
    `,
    // Exported bindings are public API; consumers may rely on Array methods.
    dedent`
      export const ITEMS = ['a', 'b'];
      ITEMS.includes(x);
    `,
    dedent`
      const ITEMS = ['a', 'b'];
      export { ITEMS };
      ITEMS.includes(x);
    `,
    // A parameter can be initialized by the caller instead of its default.
    dedent`
      function isAllowed(items = ['a', 'b'], value) {
        return items.includes(value);
      }
    `,
    // Element writes mutate the array without writing the binding itself.
    dedent`
      const ITEMS = ['a', 'b'];
      ITEMS[0] = 'c';
      ITEMS.includes(x);
    `,
    dedent`
      const ITEMS = ['a', 'b'];
      ITEMS[0] += 'c';
      ITEMS.includes(x);
    `
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
    },
    // Multiple includes calls are all compatible with one Set conversion.
    {
      code: dedent`
        const ITEMS = ['a', 'b'];
        ITEMS.includes(x);
        ITEMS.includes(y);
      `,
      errors: [
        { messageId: 'default' },
        { messageId: 'default' }
      ]
    },
    // Transparent TypeScript wrappers around the binding remain supported.
    {
      code: dedent`
        const ITEMS = ['a', 'b'];
        (ITEMS as readonly string[]).includes(x);
      `,
      errors: [{ messageId: 'default' }]
    }
  ]
}, {}, false);
