import mod from '.';
import { runTest } from '@test/run-test';
import { dedent } from 'ts-dedent';

runTest({
  module: mod,
  valid: [
    // Props with more than just children
    dedent`
      function MyComponent(props: { children: React.ReactNode; className: string }) {
        return null;
      }
    `,
    // No type annotation
    dedent`
      function MyComponent(props) {
        return null;
      }
    `,
    // Not a component (lowercase)
    dedent`
      function helper(props: { children: React.ReactNode }) {
        return null;
      }
    `,
    // Already using PropsWithChildren
    dedent`
      function MyComponent(props: React.PropsWithChildren) {
        return null;
      }
    `,
    // children is not ReactNode
    dedent`
      function MyComponent(props: { children: string }) {
        return null;
      }
    `,
    // children is a render function, not ReactNode
    dedent`
      function MyComponent(props: { children: (data: any) => React.ReactNode }) {
        return null;
      }
    `,
    // Empty props
    dedent`
      function MyComponent(props: {}) {
        return null;
      }
    `
  ],
  invalid: [
    // Inline type literal with children: React.ReactNode
    {
      code: dedent`
        function MyComponent(props: { children: React.ReactNode }) {
          return null;
        }
      `,
      output: dedent`
        function MyComponent(props: React.PropsWithChildren) {
          return null;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // Inline with just ReactNode (no React. prefix)
    {
      code: dedent`
        function MyComponent(props: { children: ReactNode }) {
          return null;
        }
      `,
      output: dedent`
        function MyComponent(props: React.PropsWithChildren) {
          return null;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // Readonly children
    {
      code: dedent`
        function MyComponent(props: { readonly children: React.ReactNode }) {
          return null;
        }
      `,
      output: dedent`
        function MyComponent(props: React.PropsWithChildren) {
          return null;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    {
      code: dedent`
        function MyComponent(props: Readonly<{ children: React.ReactNode }>) {
          return null;
        }
      `,
      output: dedent`
        function MyComponent(props: React.PropsWithChildren) {
          return null;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // Destructured props
    {
      code: dedent`
        function MyComponent({ children }: { children: React.ReactNode }) {
          return null;
        }
      `,
      output: dedent`
        function MyComponent({ children }: React.PropsWithChildren) {
          return null;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // Arrow function component
    {
      code: dedent`
        const MyComponent = (props: { children: React.ReactNode }) => {
          return null;
        };
      `,
      output: dedent`
        const MyComponent = (props: React.PropsWithChildren) => {
          return null;
        };
      `,
      errors: [{ messageId: 'default' }]
    },
    // Referenced interface
    {
      code: dedent`
        interface MyComponentProps {
          children: React.ReactNode;
        }
        function MyComponent(props: MyComponentProps) {
          return null;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // Referenced type alias
    {
      code: dedent`
        type Props = {
          children: ReactNode;
        };
        function MyComponent(props: Props) {
          return null;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // export default
    {
      code: dedent`
        export default function MyComponent(props: { children: React.ReactNode }) {
          return null;
        }
      `,
      output: dedent`
        export default function MyComponent(props: React.PropsWithChildren) {
          return null;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // memo wrapped
    {
      code: dedent`
        const MyComponent = memo((props: { children: React.ReactNode }) => {
          return null;
        });
      `,
      output: dedent`
        const MyComponent = memo((props: React.PropsWithChildren) => {
          return null;
        });
      `,
      errors: [{ messageId: 'default' }]
    }
  ]
}, {}, false);
