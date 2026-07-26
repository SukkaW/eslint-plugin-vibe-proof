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
      errors: [{ messageId: 'default', data: { pattern: '[XX, YY]' } }]
    },
    // Skipped element — holes work in destructuring
    {
      code: dedent`
        const arr = factory();
        export const XX = arr[0];
        export const ZZ = arr[2];
      `,
      errors: [{ messageId: 'default', data: { pattern: '[XX, , ZZ]' } }]
    },
    // Single element
    {
      code: dedent`
        const arr = factory();
        export const XX = arr[0];
      `,
      errors: [{ messageId: 'default', data: { pattern: '[XX]' } }]
    },
    // Out-of-order exports
    {
      code: dedent`
        const arr = factory();
        export const YY = arr[1];
        export const XX = arr[0];
      `,
      errors: [{ messageId: 'default', data: { pattern: '[XX, YY]' } }]
    },
    // Object property access
    {
      code: dedent`
        const obj = factory();
        export const XX = obj.first;
        export const YY = obj.second;
      `,
      errors: [{ messageId: 'default', data: { pattern: '{ first: XX, second: YY }' } }]
    },
    // Shorthand when the exported name matches the key
    {
      code: dedent`
        const obj = factory();
        export const first = obj.first;
        export const second = obj.second;
      `,
      errors: [{ messageId: 'default', data: { pattern: '{ first, second }' } }]
    },
    // Computed string-literal key
    {
      code: dedent`
        const obj = factory();
        export const XX = obj['foo-bar'];
      `,
      errors: [{ messageId: 'default', data: { pattern: '{ \'foo-bar\': XX }' } }]
    },
    // Same index accessed twice — expressible with a duplicate-key object pattern
    {
      code: dedent`
        const arr = factory();
        export const XX = arr[0];
        export const YY = arr[0];
      `,
      errors: [{ messageId: 'default', data: { pattern: '{ 0: XX, 0: YY }' } }]
    },
    // Sparse huge index — object pattern with numeric key beats 21 holes
    {
      code: dedent`
        const arr = factory();
        export const XX = arr[20];
      `,
      errors: [{ messageId: 'default', data: { pattern: '{ 20: XX }' } }]
    },
    // RHS doesn't need to be a function call
    {
      code: dedent`
        const obj = someImportedConfig;
        export const XX = obj.first;
      `,
      errors: [{ messageId: 'default', data: { pattern: '{ first: XX }' } }]
    },
    // Mixed numeric and named keys — object pattern handles both
    {
      code: dedent`
        const arr = factory();
        export const XX = arr[0];
        export const len = arr.length;
      `,
      errors: [{ messageId: 'default', data: { pattern: '{ 0: XX, length: len }' } }]
    }
  ]
}, {}, false);
