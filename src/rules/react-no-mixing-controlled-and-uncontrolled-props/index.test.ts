import { runTest } from '@test/run-test';
import module from '.';

runTest({
  module,
  valid: [
    '<input value={name} onChange={handleChange} />',
    '<input defaultValue="World" />',
    '<input type="checkbox" checked={isChecked} onChange={handleChange} />',
    '<input type="checkbox" defaultChecked />'
  ],
  invalid: [
    {
      code: '<input value={name} defaultValue="World" />',
      errors: [{ messageId: 'noMixingControlledAndUncontrolled' as const }]
    },
    {
      code: '<input type="checkbox" checked={isChecked} defaultChecked />',
      errors: [{ messageId: 'noMixingControlledAndUncontrolled' as const }]
    }
  ]
});
