import { dedent } from 'ts-dedent';
import mod from '.';
import { runTest } from '@test/run-test';

runTest({
  module: mod,
  invalid: [
    {
      code: dedent`
        declare const arr: number[];
        for (const x of arr) {
          console.log(x);
        }
      `,
      errors: [{ messageId: 'noForOfArray' }]
    },
    {
      code: dedent`
        for (const x of Object.entries({ a: 'b' })) {
          console.log(x);
        }
      `,
      errors: [{ messageId: 'noForOfArray' }]
    },
    {
      code: 'for (const x of [1, 2, 3]) { console.log(x); }',
      errors: [{ messageId: 'noForOfArray' }]
    },
    {
      code: dedent`
        declare const arr: readonly string[];
        for (const x of arr) {
          console.log(x);
        }
      `,
      errors: [{ messageId: 'noForOfArray' }]
    },
    {
      code: dedent`
        declare const pair: [string, number];
        for (const x of pair) {
          console.log(x);
        }
      `,
      errors: [{ messageId: 'noForOfArray' }]
    },
    {
      code: dedent`
        declare const buf: Uint8Array;
        for (const byte of buf) {
          console.log(byte);
        }
      `,
      errors: [{ messageId: 'noForOfArray' }]
    },
    // union of arrays is still always indexable
    {
      code: dedent`
        declare const u: number[] | string[];
        for (const x of u) {
          console.log(x);
        }
      `,
      errors: [{ messageId: 'noForOfArray' }]
    },
    // generic constrained to an array
    {
      code: dedent`
        function process<T extends readonly number[]>(input: T) {
          for (const x of input) {
            console.log(x);
          }
        }
      `,
      errors: [{ messageId: 'noForOfArray' }]
    },
    {
      code: dedent`
        declare const arr: number[];
        for (let i = 0; i < arr.length; i++) {
          console.log(arr[i]);
        }
      `,
      errors: [{ messageId: 'uncachedLength' }]
    },
    // `.length` read anywhere inside the test expression
    {
      code: dedent`
        declare const arr: number[];
        for (let i = 0; i <= arr.length - 1; i++) {
          console.log(arr[i]);
        }
      `,
      errors: [{ messageId: 'uncachedLength' }]
    }
  ],
  valid: [
    // the enforced form
    dedent`
      declare const arr: number[];
      for (let i = 0, len = arr.length; i < len; i++) {
        console.log(arr[i]);
      }
    `,
    // Set / Map / iterables cannot be indexed — for...of is correct
    'for (const x of new Set([1, 2])) { console.log(x); }',
    'for (const [k, v] of new Map<string, number>()) { console.log(k, v); }',
    dedent`
      declare const iterable: Iterable<number>;
      for (const x of iterable) {
        console.log(x);
      }
    `,
    dedent`
      function* generate() {
        yield 1;
      }
      for (const x of generate()) {
        console.log(x);
      }
    `,
    // an iterator is not an array — even one derived from an array — and can
    // only be consumed via for...of
    dedent`
      declare const arr: number[];
      for (const x of arr.values()) {
        console.log(x);
      }
    `,
    dedent`
      declare const cursor: Iterator<string> & { [Symbol.iterator](): Iterator<string> };
      for (const row of cursor) {
        console.log(row);
      }
    `,
    // for...of over a string iterates code points; an indexed loop iterates
    // code units — not equivalent
    dedent`
      declare const s: string;
      for (const ch of s) {
        console.log(ch);
      }
    `,
    // indeterminate types are not proven arrays
    dedent`
      declare const anything: any;
      for (const x of anything) {
        console.log(x);
      }
    `,
    dedent`
      function process<T extends Iterable<number>>(input: T) {
        for (const x of input) {
          console.log(x);
        }
      }
    `,
    // for await has different semantics
    dedent`
      declare const promises: Array<Promise<number>>;
      async function run() {
        for await (const value of promises) {
          console.log(value);
        }
      }
    `,
    // non-array .length in a for test is out of scope
    dedent`
      declare const s: string;
      for (let i = 0; i < s.length; i++) {
        console.log(s[i]);
      }
    `
  ]
});
