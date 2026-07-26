import { runTest } from '@test/run-test';
import module from '.';

runTest({
  module,
  valid: [
    '// eslint-disable-next-line no-console -- Log an error\nconsole.log(``)'
  ],
  invalid: [
    {
      code: '// eslint-disable-next-line\nconsole.log()',
      errors: [
        { messageId: 'require-description', data: { directive: 'eslint-disable-next-line' } },
        { messageId: 'require-specific-rule' }
      ]
    }
  ]
});
