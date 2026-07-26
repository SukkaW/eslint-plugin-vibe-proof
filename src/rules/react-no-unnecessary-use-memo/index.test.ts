import { runTest } from '@test/run-test';
import module from '.';
import { dedent } from 'ts-dedent';

runTest({
  module,
  invalid: [
    {
      code: dedent`
        import { useMemo } from "react";

        function App() {
          const value = useMemo(() => "foo", []);

          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    {
      code: dedent`
        function App() {
          const value = React.useMemo(() => "foo", []);

          return <div>{value}</div>;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    {
      code: dedent`
        import { useMemo } from "react";

        function App() {
          const value = useMemo(() => "foo", []);

          return <div>{value}</div>;
        }
      `,
      errors: [
        {
          messageId: 'default'
        }
      ]
    },
    {
      code: dedent`
        import { useMemo } from "react";

        const Comp = () => {
          const style = useMemo((theme) => ({
            input: {
              fontFamily: theme.fontFamilyMonospace
            }
          }), []);
          return <Button sx={style} />
        }
      `,
      errors: [
        {
          messageId: 'default'
        }
      ]
    },
    {
      code: dedent`
        import { useMemo } from "react";

        const deps = [];
        const Comp = () => {
          const value = useMemo(() => "foo", deps);
          return <div>{value}</div>;
        }
      `,
      errors: [
        {
          messageId: 'default'
        }
      ]
    },
    {
      code: dedent`
        import { useMemo } from "react";

        const Comp = () => {
          const deps = [];
          const value = useMemo(() => "foo", deps);
          return <div>{value}</div>;
        }
      `,
      errors: [
        {
          messageId: 'default'
        }
      ]
    },
    {
      code: dedent`
        import {useMemo, useState, useEffect} from 'react';

        function App({ items }) {
          const veryHeavyCalculation = useMemo(() => items.reduce((acc, item) => acc + item, 0), [items]);

          useEffect(() => {
            console.log(veryHeavyCalculation);
          }, [veryHeavyCalculation]);

          return <div>items</div>;
        }
      `,
      errors: [{ messageId: 'noUnnecessaryUseMemoInsideUseEffect' }],
      settings: {
        'react-x': {
          importSource: 'react'
        }
      }
    },
    {
      code: dedent`
        import {useMemo, useState} from 'react';

        function App({ items }) {
          const veryHeavyCalculation = useMemo(() => items.reduce((acc, item) => acc + item, 0), [items]);

          React.useEffect(() => {
            console.log(veryHeavyCalculation);
          }, [veryHeavyCalculation]);

          return <div>items</div>;
        }
      `,
      errors: [{ messageId: 'noUnnecessaryUseMemoInsideUseEffect' }],
      settings: {
        'react-x': {
          importSource: 'react'
        }
      }
    },
    {
      code: dedent`
        const { useMemo, useEffect } = require("@pika/react");

        function App({ items }) {
          const veryHeavyCalculation = useMemo(() => items.reduce((acc, item) => acc + item, 0), [items]);

          useEffect(() => {
            console.log(veryHeavyCalculation);
          }, [veryHeavyCalculation]);

          return <div>items</div>;
        }
      `,
      errors: [
        {
          messageId: 'noUnnecessaryUseMemoInsideUseEffect'
        }
      ],
      settings: {
        'react-x': {
          importSource: '@pika/react'
        }
      }
    }
  ],
  valid: [
    dedent`
      import { useMemo } from "react";

      const Comp = ({ foo }) => {
        const value = useMemo(() => foo, [foo]);
        return <div>{value}</div>;
      }
    `,
    dedent`
      import { useState } from "react";

      const Comp = () => {
        const [state, setState] = useState(false);

        return <Button />;
      };
    `,
    dedent`
      const useData = (key) => {
          return useSWR(key);
      }
    `,
    dedent`
      function useData(key) {
          return useSWR(key);
      }
    `,
    dedent`
      function useData(key) {
          const data = useSWR(key);
          return data;
      }
    `,
    dedent`
      const useData = (key) => useSWR(key);
    `,
    dedent`
      import { useState, useMemo } from "react";

      function MyComponent() {
        const [showSnapshot, setShowSnapshot] = useState(false);
        const handleSnapshot = useMemo(() => setShowSnapshot(true), []);

        return null;
      }
    `,
    dedent`
      import { useMemo } from "react";
      const deps = []
      const Comp = () => {
        const [width, setWidth] = useState<undefined | number>(undefined)
        const [open, setOpen] = useState<boolean>(false)
        const [title, setTitle] = useState<string | undefined>(undefined)
        const cb = () => {
            return {
                setWidth,
                setWrap: setOpen,
                setWrapperName: setTitle,
            }
        }
        const refItem = useMemo(cb, deps)
      };
    `,
    dedent`
      import { useMemo } from "react";

      const Comp = () => {
        const value = useMemo(() => Date.now(), []);
        return <div>{value}</div>;
      }
    `,
    dedent`
      import { useMemo } from "react";

      const Comp = () => {
        const value = useMemo(() => new Date(), []);
        return <div>{value}</div>;
      }
    `,
    dedent`
      import { useMemo } from "react";

      function MyComponent() {
        const [showSnapshot, setShowSnapshot] = useState(false);
        const handleSnapshot = useMemo(() => () => setShowSnapshot(true), []);

        return null;
      }
    `,
    dedent`
      import { useMemo } from "react";

      function MyComponent() {
        const [showSnapshot, setShowSnapshot] = useState(false);
        const handleSnapshot = useMemo(() => () => () => setShowSnapshot(true), []);

        return null;
      }
    `,
    dedent`
      import { useMemo } from "react";

      const Comp = ({ a }) => {
        const value = useMemo(() => a, [a]);
        return <div>{value}</div>;
      }
    `,
    dedent`
      import { useMemo, useState, useEffect } from 'react';

      const Component = () => {
          const [test, setTest] = useState(items.length);

          const value = useMemo(() => test + 1, [test]);

          useEffect(() => {
            // some condition
            console.log(value);
          }, [value]);

          useEffect(() => {
            // some condition
            console.log(value);
          }, [value]);

          return <div />;
      };
    `,
    dedent`
      import { useMemo, useState, useEffect } from 'react';

      const Component = () => {
          const [test, setTest] = useState(items.length);

          const value = useMemo(() => test + 1, [test]);

          useEffect(() => {
            // some condition
            console.log(value);
          }, [value]);

          return <div>{value}</div>;
      };
    `,
    dedent`
      import { useMemo, useState } from 'react';

      const Component = () => {
          const [test, setTest] = useState(items.length);

          const value = useMemo(() => test + 1, [test]);

          return <div>{value}</div>;
      };
    `,
    {
      name: 'await expression',
      code: dedent`
        import { useMemo } from "react";

        const Comp = () => {
          const value = useMemo(async () => await fetch('https://example.com'), []);
          return <div>{value}</div>;
        }
      `
    },
    {
      name: 'tagged template',
      code: dedent`
        import { useMemo } from "react";

        const Comp = () => {
          const value = useMemo(() => gql\`query { user { id } }\`, []);
          return <div>{value}</div>;
        }
      `
    },
    {
      name: 'computed member',
      code: dedent`
        import { useMemo } from "react";

        const Comp = ({ items }) => {
          const value = useMemo(() => items[0], [items]);
          return <div>{value}</div>;
        }
      `
    },
    {
      name: 'chained call',
      code: dedent`
        import { useMemo } from "react";

        const Comp = ({ items }) => {
          const value = useMemo(() => items.filter(Boolean).map(String), [items]);
          return <div>{value}</div>;
        }
      `
    },
    {
      name: 'new inside member',
      code: dedent`
        import { useMemo } from "react";

        const Comp = ({ items }) => {
          const value = useMemo(() => new Map(items), [items]);
          return <div>{value}</div>;
        }
      `
    },
    {
      name: 'import expression',
      code: dedent`
        import { useMemo } from "react";

        const Comp = () => {
          const value = useMemo(() => import('./module'), []);
          return <div>{value}</div>;
        }
      `
    }
  ]
});
