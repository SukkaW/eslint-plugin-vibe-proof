import mod from '.';
import { runTest } from '@test/run-test';
import { dedent } from 'ts-dedent';

runTest({
  module: mod,
  valid: [
    'array.at(-1)',
    'array[array.length - 2]',
    'array[other.length - 1]',
    'array[array.size - 1]',
    'array[array.length + 1]',
    'array[array.length - offset]',
    'array[array[length] - 1]',
    'array[0]',
    'array.length - 1',
    // `.at()` does not produce an assignment target.
    'array[array.length - 1] = value',
    'array[array.length - 1] += value',
    'array[array.length - 1]++',
    'delete array[array.length - 1]',
    'for (array[array.length - 1] of values) {}',
    'for (array[array.length - 1] in values) {}',
    '[array[array.length - 1]] = values',
    '({ item: array[array.length - 1] } = value)',
    '[...array[array.length - 1]] = values',
    '[array[array.length - 1] = fallback] = values',
    'array[array.length - 1]! = value',
    '(array[array.length - 1] as unknown) = value'
  ],
  invalid: [
    {
      code: 'array[array["length"] - (1 + 0)]',
      output: 'array.at(-1)',
      errors: [{ messageId: 'preferAt' }]
    },
    {
      code: 'array[array.length - 1]',
      output: 'array.at(-1)',
      errors: [{ messageId: 'preferAt' }]
    },
    {
      code: 'array[array.length-1]',
      output: 'array.at(-1)',
      errors: [{ messageId: 'preferAt' }]
    },
    {
      code: 'this.items[this.items.length - 1]',
      output: 'this.items.at(-1)',
      errors: [{ messageId: 'preferAt' }]
    },
    {
      code: 'state.items[state.items.length - 1]',
      output: 'state.items.at(-1)',
      errors: [{ messageId: 'preferAt' }]
    },
    {
      code: 'array?.[array.length - 1]',
      output: 'array?.at(-1)',
      errors: [{ messageId: 'preferAt' }]
    },
    {
      code: dedent`
        const first = one[one.length - 1];
        const second = two[two.length - 1];
      `,
      output: dedent`
        const first = one.at(-1);
        const second = two.at(-1);
      `,
      errors: [
        { messageId: 'preferAt' },
        { messageId: 'preferAt' }
      ]
    },
    {
      code: 'console.log(array[array.length - 1])',
      output: 'console.log(array.at(-1))',
      errors: [{ messageId: 'preferAt' }]
    },
    {
      code: 'if (array[array.length - 1] === "end") {}',
      output: 'if (array.at(-1) === "end") {}',
      errors: [{ messageId: 'preferAt' }]
    },
    {
      code: 'function last(array) { return array[array.length - 1] }',
      output: 'function last(array) { return array.at(-1) }',
      errors: [{ messageId: 'preferAt' }]
    },
    // Calling the receiver twice may be observable. Report it, but do not
    // change the number of evaluations automatically.
    {
      code: 'getArray()[getArray().length - 1]',
      output: null,
      errors: [{ messageId: 'preferAt' }]
    },
    {
      code: 'arrays[index][arrays[index].length - 1]',
      output: null,
      errors: [{ messageId: 'preferAt' }]
    },
    // Do not discard comments as part of an autofix.
    {
      code: 'array[array.length /* last item */ - 1]',
      output: null,
      errors: [{ messageId: 'preferAt' }]
    }
  ]
}, {}, false);

runTest({
  module: mod,
  valid: [
    dedent`
      declare const nodes: NodeList;
      const last = nodes[nodes.length - 1];
    `,
    dedent`
      declare const elements: HTMLCollection;
      const last = elements[elements.length - 1];
    `,
    dedent`
      interface CustomList {
        length: number;
        [index: number]: string;
      }
      declare const list: CustomList;
      const last = list[list.length - 1];
    `
  ],
  invalid: [
    {
      code: dedent`
        const array: number[] = [1, 2, 3];
        const last = array[array.length - 1];
      `,
      output: dedent`
        const array: number[] = [1, 2, 3];
        const last = array.at(-1);
      `,
      errors: [{ messageId: 'preferAt' }]
    },
    {
      code: dedent`
        const array: Array<string> = ['a', 'b'];
        const last = array[array.length - 1];
      `,
      output: dedent`
        const array: Array<string> = ['a', 'b'];
        const last = array.at(-1);
      `,
      errors: [{ messageId: 'preferAt' }]
    },
    {
      code: dedent`
        const tuple: [number, string] = [1, 'a'];
        const last = tuple[tuple.length - 1];
      `,
      output: dedent`
        const tuple: [number, string] = [1, 'a'];
        const last = tuple.at(-1);
      `,
      errors: [{ messageId: 'preferAt' }]
    },
    {
      code: dedent`
        const array = new Int32Array(10);
        const last = array[array.length - 1];
      `,
      output: dedent`
        const array = new Int32Array(10);
        const last = array.at(-1);
      `,
      errors: [{ messageId: 'preferAt' }]
    },
    {
      code: dedent`
        declare const text: 'hello';
        const last = text[text.length - 1];
      `,
      output: dedent`
        declare const text: 'hello';
        const last = text.at(-1);
      `,
      errors: [{ messageId: 'preferAt' }]
    },
    // Keep the report but not the upstream autofix: calling the receiver twice
    // may produce different arrays or have observable side effects.
    {
      code: dedent`
        function getItems(): string[] { return ['a', 'b']; }
        const last = getItems()[getItems().length - 1];
      `,
      output: null,
      errors: [{ messageId: 'preferAt' }]
    }
  ]
});
