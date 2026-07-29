import mod from '.';
import { runTest } from '@test/run-test';
import { dedent } from 'ts-dedent';

runTest({
  module: mod,
  valid: [
    // Already destructured in export
    'export const [XX, YY] = factory();',
    'export const { a, b } = factory();',
    // Temporary used beyond member-export
    dedent`
      const arr = factory();
      export const XX = arr[0];
      console.log(arr);
    `,
    // Temporary passed to a function
    dedent`
      const arr = factory();
      export const XX = arr[0];
      doSomething(arr);
    `,
    // Non-exported accesses (core prefer-destructuring territory)
    dedent`
      const arr = factory();
      const XX = arr[0];
      const YY = arr[1];
    `,
    // let binding may be reassigned
    dedent`
      let arr = factory();
      export const XX = arr[0];
    `,
    // Not at module level
    dedent`
      function setup() {
        const arr = factory();
        return arr[0];
      }
    `,
    // Exported temporary — someone imports the whole tuple
    dedent`
      export const arr = factory();
      export const XX = arr[0];
    `,
    // Dynamic index
    dedent`
      const arr = factory();
      export const XX = arr[i];
    `,
    // Deep access — not expressible as a single-level pattern
    dedent`
      const obj = factory();
      export const XX = obj.a.b;
    `,
    // Method call on the temporary
    dedent`
      const obj = factory();
      export const XX = obj.getValue();
    `
  ],
  invalid: [
    {
      code: dedent`
        const arr = factory();
        export const XX = arr[0];
        export const YY = arr[1];
      `,
      output: 'export const [XX, YY] = factory();',
      errors: [{ messageId: 'default', data: { pattern: '[XX, YY]' } }]
    },
    // Skipped element — holes work in destructuring
    {
      code: dedent`
        const arr = factory();
        export const XX = arr[0];
        export const ZZ = arr[2];
      `,
      output: 'export const [XX, , ZZ] = factory();',
      errors: [{ messageId: 'default', data: { pattern: '[XX, , ZZ]' } }]
    },
    // Single element
    {
      code: dedent`
        const arr = factory();
        export const XX = arr[0];
      `,
      output: 'export const [XX] = factory();',
      errors: [{ messageId: 'default', data: { pattern: '[XX]' } }]
    },
    // Out-of-order exports
    {
      code: dedent`
        const arr = factory();
        export const YY = arr[1];
        export const XX = arr[0];
      `,
      output: 'export const [XX, YY] = factory();',
      errors: [{ messageId: 'default', data: { pattern: '[XX, YY]' } }]
    },
    // Object property access
    {
      code: dedent`
        const obj = factory();
        export const XX = obj.first;
        export const YY = obj.second;
      `,
      output: 'export const { first: XX, second: YY } = factory();',
      errors: [{ messageId: 'default', data: { pattern: '{ first: XX, second: YY }' } }]
    },
    // Shorthand when the exported name matches the key
    {
      code: dedent`
        const obj = factory();
        export const first = obj.first;
        export const second = obj.second;
      `,
      output: 'export const { first, second } = factory();',
      errors: [{ messageId: 'default', data: { pattern: '{ first, second }' } }]
    },
    // Computed string-literal key
    {
      code: dedent`
        const obj = factory();
        export const XX = obj['foo-bar'];
      `,
      output: 'export const { "foo-bar": XX } = factory();',
      errors: [{ messageId: 'default', data: { pattern: '{ "foo-bar": XX }' } }]
    },
    // String-literal keys must be escaped in the generated pattern
    {
      code: dedent`
        const obj = factory();
        export const quote = obj["'"];
        export const slash = obj['\\\\'];
      `,
      output: String.raw`export const { "'": quote, "\\": slash } = factory();`,
      errors: [{ messageId: 'default', data: { pattern: String.raw`{ "'": quote, "\\": slash }` } }]
    },
    // Same index accessed twice — expressible with a duplicate-key object pattern
    {
      code: dedent`
        const arr = factory();
        export const XX = arr[0];
        export const YY = arr[0];
      `,
      output: 'export const { 0: XX, 0: YY } = factory();',
      errors: [{ messageId: 'default', data: { pattern: '{ 0: XX, 0: YY }' } }]
    },
    // Sparse huge index — object pattern with numeric key beats 21 holes
    {
      code: dedent`
        const arr = factory();
        export const XX = arr[20];
      `,
      output: 'export const { 20: XX } = factory();',
      errors: [{ messageId: 'default', data: { pattern: '{ 20: XX }' } }]
    },
    // RHS doesn't need to be a function call
    {
      code: dedent`
        const obj = someImportedConfig;
        export const XX = obj.first;
      `,
      output: 'export const { first: XX } = someImportedConfig;',
      errors: [{ messageId: 'default', data: { pattern: '{ first: XX }' } }]
    },
    // Mixed numeric and named keys — object pattern handles both
    {
      code: dedent`
        const arr = factory();
        export const XX = arr[0];
        export const len = arr.length;
      `,
      output: 'export const { 0: XX, length: len } = factory();',
      errors: [{ messageId: 'default', data: { pattern: '{ 0: XX, length: len }' } }]
    },
    // An intervening statement could observe or mutate the value through
    // another alias — report without fix
    {
      code: dedent`
        const obj = someImportedConfig;
        mutateConfig();
        export const XX = obj.first;
      `,
      output: null,
      errors: [{ messageId: 'default', data: { pattern: '{ first: XX }' } }]
    },
    // Temp shares its statement with another declarator — report without fix
    {
      code: dedent`
        const arr = factory(), other = 1;
        export const XX = arr[0];
      `,
      output: null,
      errors: [{ messageId: 'default', data: { pattern: '[XX]' } }]
    },
    // Export carries an unrelated declarator that must survive — report
    // without fix
    {
      code: dedent`
        const arr = factory();
        export const XX = arr[0], other = 1;
      `,
      output: null,
      errors: [{ messageId: 'default', data: { pattern: '[XX]' } }]
    },
    // Multiple reads in the same export can be removed as one statement
    {
      code: dedent`
        const obj = factory();
        export const first = obj.first, renamed = obj.second;
      `,
      output: 'export const { first, second: renamed } = factory();',
      errors: [{ messageId: 'default', data: { pattern: '{ first, second: renamed }' } }]
    },
    // Keep outer parentheses that belong to the declarator rather than the
    // initializer AST node
    {
      code: dedent`
        const obj = (left, right);
        export const first = obj.first;
      `,
      output: 'export const { first } = (left, right);',
      errors: [{ messageId: 'default', data: { pattern: '{ first }' } }]
    },
    // Type annotations cannot be transferred directly to the exported
    // bindings, so these are reports without fixes
    {
      code: dedent`
        const tuple: readonly [number] = factory();
        export const value = tuple[0];
      `,
      output: null,
      errors: [{ messageId: 'default', data: { pattern: '[value]' } }]
    },
    {
      code: dedent`
        const tuple = factory();
        export const value: number = tuple[0];
      `,
      output: null,
      errors: [{ messageId: 'default', data: { pattern: '[value]' } }]
    },
    // Comments inside replaced or removed nodes must not be discarded
    {
      code: dedent`
        const /* keep */ tuple = factory();
        export const value = tuple[0];
      `,
      output: null,
      errors: [{ messageId: 'default', data: { pattern: '[value]' } }]
    },
    {
      code: dedent`
        const tuple = factory();
        export /* keep */ const value = tuple[0];
      `,
      output: null,
      errors: [{ messageId: 'default', data: { pattern: '[value]' } }]
    }
  ]
}, {}, false);
