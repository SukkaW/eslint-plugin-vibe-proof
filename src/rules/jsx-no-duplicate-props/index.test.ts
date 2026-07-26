import { runTest } from '@test/run-test';
import module from '.';

runTest({
  module,
  valid: [
    '<div id="a" className="b" />',
    '<div id="a" {...props} />',
    '<div id="a" {...props} className="b" />'
  ],
  invalid: [
    {
      code: '<div id="a" id="b" />',
      errors: [{ messageId: 'noDuplicateProps' }]
    },
    {
      code: '<div onClick={handleA} onClick={handleB} />',
      errors: [{ messageId: 'noDuplicateProps' }]
    },
    {
      code: '<div id="a" className="b" id="c" />',
      errors: [{ messageId: 'noDuplicateProps' }]
    }
  ]
});
