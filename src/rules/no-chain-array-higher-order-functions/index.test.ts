import { runTest } from '@test/run-test';
import module from '.';
import { dedent } from 'ts-dedent';

runTest({
  module,
  valid: [
    '[].reduce(() => {}, 0);',
    '[].map(() => {});',
    '[].filter(() => {});',
    '[].reduce(() => {}, 0).sort();',
    '[].filter(() => {}).every(() => true);',
    // typed linting: chained methods on a non-array receiver
    dedent`
      interface QueryBuilder {
        filter(callback: (value: number) => boolean): QueryBuilder,
        map(callback: (value: number) => number): number[]
      }
      declare const qb: QueryBuilder;
      qb.filter(() => true).map((v) => v);
    `
  ],
  invalid: [
    {
      code: '[].map(() => {}).filter(() => {}, 0);',
      errors: [{
        messageId: 'detected'
      }]
    },
    {
      code: '[].filter(() => {}).map(() => {}, 0);',
      errors: [{
        messageId: 'detected'
      }]
    },
    {
      code: dedent`
        []
          .map(() => {})
          .reduce(() => {}, 0);
      `,
      errors: [{
        messageId: 'detected'
      }]
    },
    {
      code: dedent`
        arr
          .reduce(() => {}, 0)
          .map(() => {});
      `,
      errors: [{
        messageId: 'detected'
      }]
    },
    {
      code: dedent`
        arr
          .map(() => {})
          .filter(() => {}, 0);
      `,
      errors: [{
        messageId: 'detected'
      }]
    },
    // typed linting: receiver is a real array
    {
      code: dedent`
        declare const list: number[];
        list.map((v) => v + 1).filter((v) => v > 0);
      `,
      errors: [{
        messageId: 'detected'
      }]
    }
  ]
});
