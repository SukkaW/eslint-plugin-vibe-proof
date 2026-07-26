import { runTest } from '@test/run-test';
import { dedent } from 'ts-dedent';
import module from '.';

runTest({
  module,
  valid: [
    // Absolute URLs are allowed
    'location.href = \'https://example.com\'',
    'location.href = \'https://example.com/path?q=1\'',
    'window.location.href = \'https://example.com\'',
    'globalThis.location.href = \'https://example.com\'',
    'location.assign(\'https://example.com\')',
    'window.location.assign(\'https://example.com\')',
    'globalThis.location.assign(\'https://example.com\')',

    // Protocol-relative URLs are absolute
    'location.href = \'//example.com/path\'',
    'location.assign(\'//cdn.example.com/file.js\')',

    // Other protocols are absolute
    'location.href = \'ftp://files.example.com\'',
    'location.href = \'mailto:user@example.com\'',

    // Template literals starting with an absolute URL are fine
    // eslint-disable-next-line no-template-curly-in-string -- test code contains intentional template literal syntax
    'location.href = `https://example.com/${path}`',
    // eslint-disable-next-line no-template-curly-in-string -- test code contains intentional template literal syntax
    'location.assign(`https://example.com/${path}`)',

    // Non-string, non-template values cannot be statically determined — skip
    'location.href = someVariable',
    'location.assign(someVariable)',
    'window.location.href = computedUrl()',
    'window.location.assign(computedUrl())',

    // Unrelated member expressions
    'foo.location.href = \'/path\'',
    'foo.location.assign(\'/path\')',

    dedent`
      const url = 'https://example.com';
      location.href = url;
      location.assign(url);
    `,

    dedent`
      const url = 'https://example.com/' + someVariable;
      location.href = url;
      location.assign(url);
    `,

    dedent`
      const url = \`https://example.com/\${someVariable}\`;
      location.href = url;
      location.assign(url);
    `,

    // Locally-shadowed `location` is not the browser global
    dedent`
      const location = { href: '' };
      location.href = '/foo'
    `,
    dedent`
      function handler(location) { location.href = '/foo';
      location.assign('/foo') }
    `,
    // Locally-shadowed `window` / `globalThis`
    dedent`
      const window = { location: { href: '' } };
      window.location.href = '/foo'
    `,
    dedent`
      function handler(globalThis) {
        globalThis.location.assign('/foo')
      }
    `,
    // Imported `location` binding is not the browser global
    dedent`
      import { location } from './my-module';
      location.href = '/foo'
    `
  ],
  invalid: [
    // location.href = <relative>
    {
      code: 'location.href = \'/dashboard\'',
      errors: [{ messageId: 'noLocationAssignRelativeDestination', data: { method: 'location.href' } }]
    },
    {
      code: 'location[\'href\'] = \'/dashboard\'',
      errors: [{ messageId: 'noLocationAssignRelativeDestination', data: { method: 'location[\'href\']' } }]
    },
    {
      code: 'window.location.href = \'/dashboard\'',
      errors: [{ messageId: 'noLocationAssignRelativeDestination', data: { method: 'window.location.href' } }]
    },
    {
      code: 'globalThis.location.href = \'/dashboard\'',
      errors: [{ messageId: 'noLocationAssignRelativeDestination', data: { method: 'globalThis.location.href' } }]
    },

    // location.assign(<relative>)
    {
      code: 'location.assign(\'/dashboard\')',
      errors: [{ messageId: 'noLocationAssignRelativeDestination', data: { method: 'location.assign()' } }]
    },
    {
      code: 'window.location.assign(\'/dashboard\')',
      errors: [{ messageId: 'noLocationAssignRelativeDestination', data: { method: 'window.location.assign()' } }]
    },
    {
      code: 'globalThis.location.assign(\'/dashboard\')',
      errors: [{ messageId: 'noLocationAssignRelativeDestination', data: { method: 'globalThis.location.assign()' } }]
    },

    // Relative paths without a leading slash
    {
      code: 'location.href = \'./page\'',
      errors: [{ messageId: 'noLocationAssignRelativeDestination', data: { method: 'location.href' } }]
    },
    {
      code: 'location.href = \'../page\'',
      errors: [{ messageId: 'noLocationAssignRelativeDestination', data: { method: 'location.href' } }]
    },
    {
      code: 'location.assign(\'?tab=settings\')',
      errors: [{ messageId: 'noLocationAssignRelativeDestination', data: { method: 'location.assign()' } }]
    },
    {
      code: 'location.assign(\'#section\')',
      errors: [{ messageId: 'noLocationAssignRelativeDestination', data: { method: 'location.assign()' } }]
    },

    // Template literals starting with a relative path
    {
      // eslint-disable-next-line no-template-curly-in-string -- test code contains intentional template literal syntax
      code: 'location.href = `/users/${id}`',
      errors: [{ messageId: 'noLocationAssignRelativeDestination', data: { method: 'location.href' } }]
    },
    {
      // eslint-disable-next-line no-template-curly-in-string -- test code contains intentional template literal syntax
      code: 'window.location.assign(`/users/${id}/profile`)',
      errors: [{ messageId: 'noLocationAssignRelativeDestination', data: { method: 'window.location.assign()' } }]
    },

    // Hide with variable
    {
      code: dedent`
        const url = '/dashboard';
        location.href = url;
      `,
      errors: [{ messageId: 'noLocationAssignRelativeDestination', data: { method: 'location.href' } }]
    },
    {
      code: dedent`
        const path = '/dashboard';
        location.assign(path);
      `,
      errors: [{ messageId: 'noLocationAssignRelativeDestination', data: { method: 'location.assign()' } }]
    },
    {
      code: dedent`
        const url = '/dashboard/' + someVariable;
        location.href = url;
      `,
      errors: [{ messageId: 'noLocationAssignRelativeDestination', data: { method: 'location.href' } }]
    },
    {
      code: dedent`
        const url = \`/dashboard/\${someVariable}\`;
        location.href = url;
      `,
      errors: [{ messageId: 'noLocationAssignRelativeDestination', data: { method: 'location.href' } }]
    },
    {
      code: dedent`
        let url = 'https://example.com';
        url = '/other-path';
        location.href = url;
      `,
      errors: [{ messageId: 'noLocationAssignRelativeDestination', data: { method: 'location.href' } }]
    }
  ]
});
