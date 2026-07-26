import mod from '.';
import { runTest } from '@test/run-test';
import { dedent } from 'ts-dedent';

runTest({
  module: mod,
  valid: [
    dedent`
      function Component({ copy }) {
        return <button onClick={() => copy()}>Copy</button>;
      }
    `,
    // not browser global navigator
    dedent`
      function Component() {
        const navigator = { clipboard: { writeText() {} } };
        navigator.clipboard.writeText('hello');
        return null;
      }
    `,
    dedent`
      // paste, not copy
      function Component() {
        document.execCommand('paste');
        return null;
      }
    `,
    // A non-foxact clipboard solution already solves what this rule points at,
    // so it must not be flagged
    dedent`
      import copy from 'copy-to-clipboard';
      function Component() {
        return <button onClick={() => copy('hello')}>Copy</button>;
      }
    `,
    dedent`
      import { useCopyToClipboard } from 'react-use';
      function Component() {
        const [state, copyToClipboard] = useCopyToClipboard();
        return <button onClick={() => copyToClipboard('hello')}>Copy</button>;
      }
    `,
    dedent`
      import { useCopyToClipboard } from 'usehooks-ts';
      function Component() {
        const [copiedText, copy] = useCopyToClipboard();
        return <button onClick={() => copy('hello')}>Copy</button>;
      }
    `,
    dedent`
      import { useClipboard } from '@mantine/hooks';
      function Component() {
        const clipboard = useClipboard();
        return <button onClick={() => clipboard.copy('hello')}>Copy</button>;
      }
    `,
    // \`navigator\` imported from a package shadows the global
    dedent`
      import { navigator } from 'navigator-shim';
      function Component() {
        navigator.clipboard.writeText('hello');
        return null;
      }
    `,
    // Namespace import — \`shim.navigator\` is not the browser global
    dedent`
      import * as shim from 'navigator-shim';
      function Component() {
        shim.navigator.clipboard.writeText('hello');
        return null;
      }
    `,
    // A third-party object that merely exposes a \`clipboard\` property
    dedent`
      import { editor } from 'some-editor-sdk';
      function Component() {
        editor.clipboard.writeText('hello');
        return null;
      }
    `,
    // An imported \`document\` shim is not the browser global
    dedent`
      import { document } from 'ssr-window';
      function Component() {
        document.execCommand('copy');
        return null;
      }
    `
  ],
  invalid: [
    {
      code: dedent`
        function Component() {
          navigator.clipboard.writeText('hello');
          return null;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    {
      code: dedent`
        async function Component() {
          await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob(['hi']) })]);
          return null;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    {
      code: dedent`
        function Component() {
          const { writeText } = navigator.clipboard;
          return <button onClick={() => writeText('hello')}>Copy</button>;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    {
      code: dedent`
        function Component() {
          document.execCommand('copy');
          return null;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    {
      code: dedent`
        function Component() {
          window.document.execCommand('cut');
          return null;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    {
      code: dedent`
        function Component() {
          window.navigator.clipboard.writeText('hello');
          return null;
        }
      `,
      errors: [{ messageId: 'default' }]
    }
  ]
}, {}, false);
