import mod from '.';
import { runTest } from '@test/run-test';
import { dedent } from 'ts-dedent';

runTest({
  module: mod,
  valid: [
    // find in event handler (not render phase)
    dedent`
      function Component() {
        const onClick = () => {
          const item = items.find(x => x.id === id);
        };
        return <button onClick={onClick} />;
      }
    `,
    // find in useEffect
    dedent`
      function Component() {
        useEffect(() => {
          const item = items.find(x => x.id === id);
        }, []);
        return null;
      }
    `,
    // find outside component
    dedent`
      const item = items.find(x => x.id === id);
    `,
    // find in non-component function
    dedent`
      function helper() {
        return items.find(x => x.id === id);
      }
    `,
    // find with no arguments (not Array.prototype.find)
    dedent`
      function Component() {
        return items.find();
      }
    `,
    // find in nested callback inside event handler
    dedent`
      function Component() {
        const onSubmit = async () => {
          const result = data.find(d => d.key === key);
        };
        return <form onSubmit={onSubmit} />;
      }
    `
  ],
  invalid: [
    // find directly in component render body
    {
      code: dedent`
        function Component() {
          const item = items.find(x => x.id === id);
          return <div>{item}</div>;
        }
      `,
      errors: [{ messageId: 'render' }]
    },
    // find in arrow component
    {
      code: dedent`
        const Component = () => {
          const item = items.find(x => x.id === id);
          return <div>{item}</div>;
        };
      `,
      errors: [{ messageId: 'render' }]
    },
    // find in useMemo
    {
      code: dedent`
        function Component() {
          const item = useMemo(() => items.find(x => x.id === id), [items, id]);
          return <div>{item}</div>;
        }
      `,
      errors: [{ messageId: 'useMemo' }]
    },
    // find in React.useMemo
    {
      code: dedent`
        function Component() {
          const item = React.useMemo(() => items.find(x => x.id === id), [items, id]);
          return <div>{item}</div>;
        }
      `,
      errors: [{ messageId: 'useMemo' }]
    },
    // find in custom hook
    {
      code: dedent`
        function useMyHook() {
          const item = items.find(x => x.id === id);
          return item;
        }
      `,
      errors: [{ messageId: 'render' }]
    },
    // find in memo() wrapped component
    {
      code: dedent`
        const Component = memo(() => {
          const item = items.find(x => x.id === id);
          return <div>{item}</div>;
        });
      `,
      errors: [{ messageId: 'render' }]
    }
  ]
}, {}, false);
