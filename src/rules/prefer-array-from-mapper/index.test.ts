import mod from '.';
import { runTest } from '@test/run-test';
import { dedent } from 'ts-dedent';

runTest({
  module: mod,
  valid: [
    'Array.from(iterable, value => value * 2)',
    'Array.from(iterable)',
    '[...iterable]',
    'items.map(mapper)',
    '[1, 2, 3].map(mapper)',
    '[...first, ...second].map(mapper)',
    '[head, ...tail].map(mapper)',
    '[...items, tail].map(mapper)',
    '[...items].map(mapper, thisArg)',
    '[...items].map()',
    '[...items].map(...mappers)',
    '[...items].map?.(mapper)',
    '[...items]?.map(mapper)',
    'Array.from(items).map(mapper, thisArg)',
    'Array.from(items, firstMapper).map(secondMapper)',
    'Array.from(items).filter(predicate)',
    'Array.from?.(items).map(mapper)',
    // Array.prototype.map passes the source array as a third argument, while
    // the Array.from mapper only receives the value and index.
    '[...items].map((value, index, array) => array[index])',
    'Array.from(items).map(function (value, index, array) { return array[index]; })',
    '[...items].map((...args) => args[0])',
    // Do not introduce or use a shadowed Array constructor.
    dedent`
      function transform(Array, items) {
        return [...items].map(mapper);
      }
    `,
    dedent`
      function transform(Array, items) {
        return Array.from(items).map(mapper);
      }
    `
  ],
  invalid: [
    {
      code: '[...iterable]["map"](fn)',
      output: 'Array.from(iterable, fn)',
      errors: [{ messageId: 'preferArrayFromMapper' }]
    },
    {
      code: 'Array["from"](iterable).map(fn)',
      output: 'Array.from(iterable, fn)',
      errors: [{ messageId: 'preferArrayFromMapper' }]
    },
    {
      code: '[...items].map(mapper)',
      output: 'Array.from(items, mapper)',
      errors: [{ messageId: 'preferArrayFromMapper' }]
    },
    {
      code: '[...items].map(value => value * 2)',
      output: 'Array.from(items, value => value * 2)',
      errors: [{ messageId: 'preferArrayFromMapper' }]
    },
    {
      code: '[...map.values()].map(process)',
      output: 'Array.from(map.values(), process)',
      errors: [{ messageId: 'preferArrayFromMapper' }]
    },
    {
      code: 'Array.from(iterator).map(mapper)',
      output: 'Array.from(iterator, mapper)',
      errors: [{ messageId: 'preferArrayFromMapper' }]
    },
    {
      code: 'Array.from(getIterator()).map(value => value.id)',
      output: 'Array.from(getIterator(), value => value.id)',
      errors: [{ messageId: 'preferArrayFromMapper' }]
    },
    {
      code: 'Array.from(iterator).map(mapper).filter(predicate)',
      output: 'Array.from(iterator, mapper).filter(predicate)',
      errors: [{ messageId: 'preferArrayFromMapper' }]
    },
    {
      code: dedent`
        const first = [...items].map(firstMapper);
        const second = Array.from(iterator).map(secondMapper);
      `,
      output: dedent`
        const first = Array.from(items, firstMapper);
        const second = Array.from(iterator, secondMapper);
      `,
      errors: [
        { messageId: 'preferArrayFromMapper' },
        { messageId: 'preferArrayFromMapper' }
      ]
    },
    // Preserve comments by reporting without an autofix.
    {
      code: '[...items /* keep */].map(mapper)',
      output: null,
      errors: [{ messageId: 'preferArrayFromMapper' }]
    },
    {
      code: 'Array.from(/* keep */ iterator).map(mapper)',
      output: null,
      errors: [{ messageId: 'preferArrayFromMapper' }]
    }
  ]
}, {}, false);
