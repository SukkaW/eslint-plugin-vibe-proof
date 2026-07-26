import { dedent } from 'ts-dedent';
import mod from '.';
import { runTest } from '@test/run-test';

runTest({
  module: mod,
  valid: [
    // Module-level regex is fine
    'const RE = /foo/;',
    'const RE = /foo/gi;',
    // Module-level regex used in function
    `const RE = /foo/;
function test(s) { return RE.test(s); }`,
    // String literal inside function (not regex)
    'function test(s) { return s.includes("foo"); }',
    // new RegExp inside function — dynamic, not a literal
    'function test(s) { return new RegExp(s).test("bar"); }',
    // Static class property is fine (runs once)
    dedent`
      class Foo {
        static pattern = /foo/;
      }
    `,
    // Static block is fine (runs once)
    dedent`
      class Foo {
        static {
          const re = /foo/;
        }
      }
    `
  ],
  invalid: [
    // Regex inside function declaration
    {
      code: 'function test(s) { return /foo/.test(s); }',
      errors: [{ messageId: 'default' }]
    },
    // Regex inside arrow function
    {
      code: 'const test = (s) => /foo/.test(s);',
      errors: [{ messageId: 'default' }]
    },
    // Regex inside function expression
    {
      code: 'const test = function(s) { return /foo/.test(s); };',
      errors: [{ messageId: 'default' }]
    },
    // Regex with flags inside function
    {
      code: 'function test(s) { return /foo/gi.test(s); }',
      errors: [{ messageId: 'default' }]
    },
    // Regex inside method
    {
      code: `const obj = {
  test(s) { return /foo/.test(s); }
};`,
      errors: [{ messageId: 'default' }]
    },
    // Regex inside nested function
    {
      code: `function outer() {
  function inner(s) { return /foo/.test(s); }
}`,
      errors: [{ messageId: 'default' }]
    },
    // Regex in callback
    {
      code: 'items.filter(item => /foo/.test(item));',
      errors: [{ messageId: 'default' }]
    },
    // Multiple regex in function
    {
      code: `function test(s) {
  return /foo/.test(s) && /bar/.test(s);
}`,
      errors: [{ messageId: 'default' }, { messageId: 'default' }]
    },
    // regex in top level loop
    {
      code: 'while (/foo/.test(s)) {}',
      errors: [{ messageId: 'default' }]
    },
    {
      code: dedent`
        for (let i = 0; i < 100; i++) {
          /foo/.test(s);
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // do-while loop
    {
      code: 'do { /foo/.test(s); } while (true);',
      errors: [{ messageId: 'default' }]
    },
    // for-in loop
    {
      code: 'for (const key in obj) { /foo/.test(key); }',
      errors: [{ messageId: 'default' }]
    },
    // for-of loop
    {
      code: 'for (const item of items) { /foo/.test(item); }',
      errors: [{ messageId: 'default' }]
    },
    // regex in loop condition
    {
      code: dedent`
        for (let s = getData(); /foo/.test(s); s = getData()) {
          process(s);
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // regex inside loop inside function
    {
      code: dedent`
        function test(items) {
          for (const item of items) {
            if (/foo/.test(item)) return item;
          }
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // Non-static class property — re-created per instance
    {
      code: dedent`
        class Foo {
          pattern = /foo/;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // Non-static class property with method call
    {
      code: dedent`
        class Foo {
          matches = (s) => /foo/.test(s);
        }
      `,
      errors: [{ messageId: 'default' }]
    }
  ]
}, {}, false);
