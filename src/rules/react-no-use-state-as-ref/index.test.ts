import mod from '.';
import { runTest } from '@test/run-test';
import { dedent } from 'ts-dedent';

runTest({
  module: mod,
  valid: [
    // Both value and setter used
    dedent`
      function Component() {
        const [value, setValue] = useState(0);
        setValue(1);
        return value;
      }
    `,
    // Setter passed to child
    dedent`
      function Component() {
        const [value, setValue] = useState(0);
        return <Child onChange={setValue} />;
      }
    `,
    // Not a useState call
    dedent`
      function Component() {
        const [a, b] = useSomething();
        return a;
      }
    `,
    // useRef is fine
    dedent`
      function Component() {
        const ref = useRef(0);
        return ref.current;
      }
    `
  ],
  invalid: [
    // Only value destructured, no setter
    {
      code: dedent`
        function Component() {
          const [value] = useState(0);
          return value;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // Setter destructured but never used
    {
      code: dedent`
        function Component() {
          const [value, setValue] = useState(0);
          return value;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // Setter explicitly ignored with underscore
    {
      code: dedent`
        function Component() {
          const [value, _setValue] = useState(0);
          return value;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // Custom useState-like hook
    {
      code: dedent`
        function Component() {
          const [value] = useCustomState(0);
          return value;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // React.useState
    {
      code: dedent`
        function Component() {
          const [value] = React.useState(0);
          return value;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // Setter with underscore prefix _
    {
      code: dedent`
        function Component() {
          const [value, _] = useState(0);
          return value;
        }
      `,
      errors: [{ messageId: 'default' }]
    }
  ]
}, {}, false);
