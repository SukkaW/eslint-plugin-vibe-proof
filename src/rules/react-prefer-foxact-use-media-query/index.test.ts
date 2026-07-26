import mod from '.';
import { runTest } from '@test/run-test';
import { dedent } from 'ts-dedent';

runTest({
  module: mod,
  valid: [
    dedent`
      // from argument
      function Component({ matchMedia }) {
        return matchMedia('(min-width: 768px)');
      }
    `,
    dedent`
      // fake window
      function Component() {
        const window = { matchMedia: () => ({ matches: false }) };
        return window.matchMedia('(min-width: 768px)');
      }
    `,
    dedent`
      // fake media match API
      function Component() {
        const media = fakeMediaMatcher();
        return media.matchMedia('(min-width: 768px)');
      }
    `,
    // A non-foxact media-query solution already solves what this rule points
    // at, so it must not be flagged
    dedent`
      import { useMediaQuery } from 'react-responsive';
      function Component() {
        return useMediaQuery({ minWidth: 768 });
      }
    `,
    dedent`
      import { useMediaQuery } from 'usehooks-ts';
      function Component() {
        return useMediaQuery('(min-width: 768px)');
      }
    `,
    dedent`
      import { useMediaQuery } from '@mantine/hooks';
      function Component() {
        return useMediaQuery('(min-width: 768px)');
      }
    `,
    // \`matchMedia\` imported from a package shadows the global
    dedent`
      import matchMedia from 'matchmedia-polyfill';
      function Component() {
        return matchMedia('(min-width: 768px)');
      }
    `,
    // A \`window\` shim imported for SSR is not the browser global
    dedent`
      import { window } from 'ssr-window';
      function Component() {
        return window.matchMedia('(min-width: 768px)');
      }
    `,
    // Namespace import from a third-party package
    dedent`
      import * as ssr from 'ssr-window';
      function Component() {
        return ssr.window.matchMedia('(min-width: 768px)');
      }
    `,
    // Locally required (CJS) shim
    dedent`
      const { matchMedia } = require('matchmedia-polyfill');
      function Component() {
        return matchMedia('(min-width: 768px)');
      }
    `
  ],
  invalid: [
    {
      code: dedent`
        function Component() {
          return window.matchMedia('(min-width: 768px)');
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    {
      code: dedent`
        function Component() {
          // bare global API
          return matchMedia('(min-width: 768px)');
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    {
      code: dedent`
        function Component() {
          return globalThis.window.matchMedia('(min-width: 768px)');
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    {
      code: dedent`
        function Component() {
          return self.matchMedia('(min-width: 768px)');
        }
      `,
      errors: [{ messageId: 'default' }]
    }
  ]
}, {}, false);
