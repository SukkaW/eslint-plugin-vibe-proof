import { runTest } from '@test/run-test';
import module from '.';
import { dedent } from 'ts-dedent';

runTest({
  module,
  invalid: [
    {
      code: dedent`
        import { useState, useCallback } from "react";

        function MyComponent() {
          const a = 1;
          const handleSnapshot = useCallback(() => Number(1), []);

          return null;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    {
      code: dedent`
        import { useState, useCallback } from "react";

        function MyComponent() {
          const a = 1;
          const handleSnapshot = useCallback(() => new String("1"), []);

          return null;
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
        import { useCallback } from "react";

        const Comp = () => {
            const onClick = useCallback(() => {
              console.log("clicked");
            }, []);

            return <Button onClick={onClick} />;
          };
      `,
      errors: [
        {
          messageId: 'default'
        }
      ]
    },
    {
      code: dedent`
        import { useCallback } from "react";

        const deps = [];
        const Comp = () => {
            const onClick = useCallback(() => {
              console.log("clicked");
            }, deps);

            return <Button onClick={onClick} />;
          };
      `,
      errors: [
        {
          messageId: 'default'
        }
      ]
    },
    {
      code: dedent`
        import { useCallback } from "react";

        const Comp = () => {
          const deps = [];
          const onClick = useCallback(() => {
            console.log("clicked");
            }, deps);

            return <Button onClick={onClick} />;
          };
      `,
      errors: [
        {
          messageId: 'default'
        }
      ]
    },
    {
      code: dedent`
        import { useCallback } from "react";

        const Comp = () => {
          const style = useCallback((theme) => ({
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
        const { useCallback } = require("react");

        const Comp = () => {
          const style = useCallback((theme) => ({
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
        import React from "react";

        const Comp = () => {
          const style = React.useCallback((theme) => ({
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
        import React from "roact";

        function App({ items }) {
          const memoizedValue = React.useCallback(() => [0, 1, 2].sort(), []);

          return <div>{count}</div>;
        }
      `,
      errors: [
        {
          messageId: 'default'
        }
      ],
      settings: {
        'react-x': {
          importSource: 'roact'
        }
      }
    },
    {
      code: dedent`
        import Roact from "roact";

        function App({ items }) {
          const memoizedValue = Roact.useCallback(() => [0, 1, 2].sort(), []);

          return <div>{count}</div>;
        }
      `,
      errors: [
        {
          messageId: 'default'
        }
      ],
      settings: {
        'react-x': {
          importSource: 'roact'
        }
      }
    },
    {
      code: dedent`
        import { useCallback } from "roact";

        function App({ items }) {
          const memoizedValue = useCallback(() => [0, 1, 2].sort(), []);

          return <div>{count}</div>;
        }
      `,
      errors: [
        {
          messageId: 'default'
        }
      ],
      settings: {
        'react-x': {
          importSource: 'roact'
        }
      }
    },
    {
      code: dedent`
        import React from "@pika/react";

        function App({ items }) {
          const memoizedValue = React.useCallback(() => [0, 1, 2].sort(), []);

          return <div>{count}</div>;
        }
      `,
      errors: [
        {
          messageId: 'default'
        }
      ],
      settings: {
        'react-x': {
          importSource: '@pika/react'
        }
      }
    },
    {
      code: dedent`
        import Pika from "@pika/react";

        function App({ items }) {
          const memoizedValue = Pika.useCallback(() => [0, 1, 2].sort(), []);

          return <div>{count}</div>;
        }
      `,
      errors: [
        {
          messageId: 'default'
        }
      ],
      settings: {
        'react-x': {
          importSource: '@pika/react'
        }
      }
    },
    {
      code: dedent`
        import { useCallback } from "@pika/react";

        function App({ items }) {
          const memoizedValue = useCallback(() => [0, 1, 2].sort(), []);

          return <div>{count}</div>;
        }
      `,
      errors: [
        {
          messageId: 'default'
        }
      ],
      settings: {
        'react-x': {
          importSource: '@pika/react'
        }
      }
    },
    {
      code: dedent`
        const React = require("roact");

        function App({ items }) {
          const memoizedValue = React.useCallback(() => [0, 1, 2].sort(), []);

          return <div>{count}</div>;
        }
      `,
      errors: [
        {
          messageId: 'default'
        }
      ],
      settings: {
        'react-x': {
          importSource: 'roact'
        }
      }
    },
    {
      code: dedent`
        const Roact = require("roact");

        function App({ items }) {
          const memoizedValue = Roact.useCallback(() => [0, 1, 2].sort(), []);

          return <div>{count}</div>;
        }
      `,
      errors: [
        {
          messageId: 'default'
        }
      ],
      settings: {
        'react-x': {
          importSource: 'roact'
        }
      }
    },
    {
      code: dedent`
        const { useCallback } = require("roact");

        function App({ items }) {
          const memoizedValue = useCallback(() => [0, 1, 2].sort(), []);

          return <div>{count}</div>;
        }
      `,
      errors: [
        {
          messageId: 'default'
        }
      ],
      settings: {
        'react-x': {
          importSource: 'roact'
        }
      }
    },
    {
      code: dedent`
        const React = require("@pika/react");

        function App({ items }) {
          const memoizedValue = React.useCallback(() => [0, 1, 2].sort(), []);

          return <div>{count}</div>;
        }
      `,
      errors: [
        {
          messageId: 'default'
        }
      ],
      settings: {
        'react-x': {
          importSource: '@pika/react'
        }
      }
    },
    {
      code: dedent`
        const Pika = require("@pika/react");

        function App({ items }) {
          const memoizedValue = Pika.useCallback(() => [0, 1, 2].sort(), []);

          return <div>{count}</div>;
        }
      `,
      errors: [
        {
          messageId: 'default'
        }
      ],
      settings: {
        'react-x': {
          importSource: '@pika/react'
        }
      }
    },
    {
      code: dedent`
        const { useCallback } = require("@pika/react");

        function App({ items }) {
          const memoizedValue = useCallback(() => [0, 1, 2].sort(), []);

          return <div>{count}</div>;
        }
      `,
      errors: [
        {
          messageId: 'default'
        }
      ],
      settings: {
        'react-x': {
          importSource: '@pika/react'
        }
      }
    },

    {
      code: dedent`
        import {useCallback, useState, useEffect} from 'react';

        function App({ items }) {
          const [test, setTest] = useState(0);

          const updateTest = useCallback(() => {setTest(items.length)}, [items]);

          useEffect(() => {
           updateTest();
          }, [updateTest]);

          return <div>items</div>;
        }
      `,
      errors: [{ messageId: 'noUnnecessaryUseCallbackInsideUseEffect' }],
      settings: {
        'react-x': {
          importSource: 'react'
        }
      }
    },
    {
      code: dedent`
        import {useCallback, useState} from 'react';

        function App({ items }) {
          const [test, setTest] = useState(0);

          const updateTest = useCallback(() => {setTest(items.length)}, [items]);

          React.useEffect(() => {
           updateTest();
          }, [updateTest]);

          return <div>items</div>;
        }
      `,
      errors: [{ messageId: 'noUnnecessaryUseCallbackInsideUseEffect' }],
      settings: {
        'react-x': {
          importSource: 'react'
        }
      }
    },
    {
      code: dedent`
        import {useCallback, useState, useEffect} from 'react';

        function App({ items }) {
          const [test, setTest] = useState(0);

          const updateTest = useCallback(() => {console.log('test')}, []);

          useEffect(() => {
            updateTest();
          }, [updateTest]);

          return <div>items</div>;
        }
      `,
      errors: [
        {
          messageId: 'default'
        }
      ],
      settings: {
        'react-x': {
          importSource: 'react'
        }
      }
    },
    {
      code: dedent`
        import {useCallback, useState, useEffect} from 'react';

        function App({ items }) {
          const [test, setTest] = useState(0);

          const updateTest = useCallback(() => {setTest(items.length)}, [items]);

          useEffect(() => {
            updateTest();
          }, [updateTest]);

          return <div>items</div>;
        }

          function App({ items }) {
          const [test, setTest] = useState(0);

          const updateTest = useCallback(() => {setTest(items.length)}, [items]);

          useEffect(() => {
            updateTest();
          }, [updateTest]);

          return <div>items</div>;
        }
      `,
      errors: [
        {
          messageId: 'noUnnecessaryUseCallbackInsideUseEffect'
        },
        {
          messageId: 'noUnnecessaryUseCallbackInsideUseEffect'
        }
      ],
      settings: {
        'react-x': {
          importSource: 'react'
        }
      }
    },
    {
      code: dedent`
        const { useCallback, useEffect } = require("@pika/react");

        function App({ items }) {
          const [test, setTest] = useState(0);

          const updateTest = useCallback(() => {setTest(items.length)}, [items]);

          useEffect(() => {
            updateTest();
          }, [updateTest]);

          return <div>items</div>;
        }
      `,
      errors: [
        {
          messageId: 'noUnnecessaryUseCallbackInsideUseEffect'
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
      const onClick = () => {
        console.log("clicked");
      };

      const Comp = () => {
        return <Button onClick={onClick} />;
      };
    `,
    dedent`
      import { useCallback } from "react";

      const Comp = ({ theme }) => {
        const style = useCallback(() => ({
          input: {
            fontFamily: theme.fontFamilyMonospace
          }
        }), [theme.fontFamilyMonospace]);
        return <Button sx={style} />
      }
    `,
    dedent`
      import { useState, useCallback } from "react";

      function MyComponent() {
        const [showSnapshot, setShowSnapshot] = useState(false);
        const handleSnapshot = useCallback(() => setShowSnapshot(true), []);

        return null;
      }
    `,
    dedent`
      import { useCallback } from "react";

      const Comp = () => {
      const [width, setWidth] = useState<undefined | number>(undefined)
              const [open, setOpen] = useState<boolean>(false)
              const [title, setTitle] = useState<string | undefined>(undefined)

              const refItem = useCallback(() => {
                  return {
                      setWidth,
                      setWrap: setOpen,
                      setWrapperName: setTitle,
                  }
              }, [])
      };
    `,
    dedent`
      import { useCallback } from "react";
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
              const refItem = useCallback(cb, deps)
      };
    `,

    dedent`
      import { useCallback, useState, useEffect } from 'react';

      function App({ items }) {
        const [test, setTest] = useState(items.length);

        const updateTest = useCallback(() => { setTest(items.length + 1) }, [setTest, items]);

        useEffect(function () {
          function foo() {
            updateTest();
          }

          foo();

          updateTest();
        }, [updateTest])

        return <div onClick={() => updateTest()}>{test}</div>;
      }
    `,
    dedent`
      import { useCallback, useState, useEffect } from 'react';

      const Component = () => {
          const [test, setTest] = useState(items.length);

          const updateTest = useCallback(() => { setTest(items.length + 1) }, [setTest, items]);

          useEffect(() => {
            // some condition
            updateTest();
          }, [updateTest]);

          useEffect(() => {
            // some condition
            updateTest();
          }, [updateTest]);

          return <div />;
      };
    `,
    dedent`
      import { useCallback, useState, useEffect } from 'react';

      const Component = () => {
        const [test, setTest] = useState(items.length);

        const updateTest = useCallback(() => { setTest(items.length + 1) }, [setTest, items]);

        return <div ref={() => updateTest()} />;
      };
    `,
    dedent`
      import { useCallback, useState, useEffect } from 'react';

      const Component = () => {
        const [test, setTest] = useState(items.length);

        const updateTest = useCallback(() => { setTest(items.length + 1) }, [setTest, items]);

        return <div onClick={updateTest} />;
      };
    `
  ]
});
