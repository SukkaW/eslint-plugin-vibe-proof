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
    // Without type information only an array literal proves an array; any
    // other value gets an object pattern, which reads by index like the
    // original code (array-pattern cases are in the typed block below)
    {
      code: dedent`
        const arr = factory();
        export const XX = arr[0];
        export const YY = arr[1];
      `,
      output: 'export const { 0: XX, 1: YY } = factory();',
      errors: [{ messageId: 'default', data: { pattern: '{ 0: XX, 1: YY }' } }]
    },
    {
      code: dedent`
        const arr = [1, 2];
        export const XX = arr[0];
        export const YY = arr[1];
      `,
      output: 'export const [XX, YY] = [1, 2];',
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
      errors: [{ messageId: 'default', data: { pattern: '{ 0: XX }' } }]
    },
    // Export carries an unrelated declarator that must survive — report
    // without fix
    {
      code: dedent`
        const arr = factory();
        export const XX = arr[0], other = 1;
      `,
      output: null,
      errors: [{ messageId: 'default', data: { pattern: '{ 0: XX }' } }]
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
      errors: [{ messageId: 'default', data: { pattern: '{ 0: value }' } }]
    },
    {
      code: dedent`
        const tuple = factory();
        export const value: number = tuple[0];
      `,
      output: null,
      errors: [{ messageId: 'default', data: { pattern: '{ 0: value }' } }]
    },
    // Comments inside replaced or removed nodes must not be discarded
    {
      code: dedent`
        const /* keep */ tuple = factory();
        export const value = tuple[0];
      `,
      output: null,
      errors: [{ messageId: 'default', data: { pattern: '{ 0: value }' } }]
    },
    {
      code: dedent`
        const tuple = factory();
        export /* keep */ const value = tuple[0];
      `,
      output: null,
      errors: [{ messageId: 'default', data: { pattern: '{ 0: value }' } }]
    },
    // An array pattern reads through the iterator instead of index access:
    // non-iterables throw, and strings iterate by code point
    {
      code: dedent`
        const o = { 0: "a", 1: "b" };
        export const first = o[0];
        export const second = o[1];
      `,
      output: 'export const { 0: first, 1: second } = { 0: "a", 1: "b" };',
      errors: [{ messageId: 'default', data: { pattern: '{ 0: first, 1: second }' } }]
    },
    {
      code: 'const s = "\\uD83D\\uDE00x";\nexport const first = s[0];\nexport const second = s[1];',
      output: String.raw`export const { 0: first, 1: second } = "\uD83D\uDE00x";`,
      errors: [{ messageId: 'default', data: { pattern: '{ 0: first, 1: second }' } }]
    }
  ]
}, {}, false);

// With type information, a value typed as an array or tuple gets an array pattern
runTest({
  module: mod,
  valid: [],
  invalid: [
    {
      code: 'declare function factory(): number[];\nconst arr = factory();\nexport const XX = arr[0];\nexport const YY = arr[1];',
      output: 'declare function factory(): number[];\nexport const [XX, YY] = factory();',
      errors: [{ messageId: 'default', data: { pattern: '[XX, YY]' } }]
    },
    // Skipped element — holes work in destructuring
    {
      code: 'declare function factory(): number[];\nconst arr = factory();\nexport const XX = arr[0];\nexport const ZZ = arr[2];',
      output: 'declare function factory(): number[];\nexport const [XX, , ZZ] = factory();',
      errors: [{ messageId: 'default', data: { pattern: '[XX, , ZZ]' } }]
    },
    // Single element
    {
      code: 'declare function factory(): number[];\nconst arr = factory();\nexport const XX = arr[0];',
      output: 'declare function factory(): number[];\nexport const [XX] = factory();',
      errors: [{ messageId: 'default', data: { pattern: '[XX]' } }]
    },
    // Out-of-order exports
    {
      code: 'declare function factory(): number[];\nconst arr = factory();\nexport const YY = arr[1];\nexport const XX = arr[0];',
      output: 'declare function factory(): number[];\nexport const [XX, YY] = factory();',
      errors: [{ messageId: 'default', data: { pattern: '[XX, YY]' } }]
    },
    {
      code: 'declare function factory(): readonly [string, number];\nconst pair = factory();\nexport const XX = pair[0];\nexport const YY = pair[1];',
      output: 'declare function factory(): readonly [string, number];\nexport const [XX, YY] = factory();',
      errors: [{ messageId: 'default', data: { pattern: '[XX, YY]' } }]
    },
    // Strings and values of unknown type still get an object pattern
    {
      code: 'declare function factory(): string;\nconst s = factory();\nexport const XX = s[0];\nexport const YY = s[1];',
      output: 'declare function factory(): string;\nexport const { 0: XX, 1: YY } = factory();',
      errors: [{ messageId: 'default', data: { pattern: '{ 0: XX, 1: YY }' } }]
    },
    {
      code: 'declare function factory(): any;\nconst arr = factory();\nexport const XX = arr[0];\nexport const YY = arr[1];',
      output: 'declare function factory(): any;\nexport const { 0: XX, 1: YY } = factory();',
      errors: [{ messageId: 'default', data: { pattern: '{ 0: XX, 1: YY }' } }]
    }
  ]
});
