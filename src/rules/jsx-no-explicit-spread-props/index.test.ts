import { runTest } from '@test/run-test';
import module from '.';

runTest({
  module,
  valid: [
    '<div {...props} />',
    '<Comp {...(cond ? { a: "b" } : {})} />'
  ],
  invalid: [
    {
      code: '<MyComponent {...{ foo, bar, baz }} />',
      errors: [{ messageId: 'noExplicitSpread' }]
    },
    {
      code: '<input {...{ disabled: true, readOnly: true }} />',
      errors: [{ messageId: 'noExplicitSpread' }]
    }
  ]
});
