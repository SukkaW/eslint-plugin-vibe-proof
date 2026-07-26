import mod from '.';
import { runTest } from '@test/run-test';
import { dedent } from 'ts-dedent';

runTest({
  module: mod,
  valid: [
    // Storing non-reactive values in refs is fine
    dedent`
      import { useRef, useEffect } from 'react';

      function Component() {
        const timerRef = useRef(null);
        useEffect(() => {
          timerRef.current = setTimeout(() => {}, 1000);
          return () => clearTimeout(timerRef.current);
        }, []);
        return null;
      }
    `,
    // Clearing a ref
    dedent`
      import { useRef } from 'react';

      function Component() {
        const ref = useRef(null);
        const reset = () => { ref.current = null; };
        return null;
      }
    `,
    // Callback ref storing a DOM element — the element is not a reactive value
    dedent`
      import { useRef } from 'react';

      function Component() {
        const domRef = useRef(null);
        return <div ref={(el) => { domRef.current = el; }} />;
      }
    `,
    // Writing to something that is not a useRef binding
    dedent`
      function Component({ value }) {
        const box = { current: null };
        box.current = value;
        return null;
      }
    `,
    // A ref stored into another ref is a stable container, not reactive
    dedent`
      import { useRef } from 'react';

      function Component() {
        const a = useRef(null);
        const b = useRef(null);
        b.current = a;
        return null;
      }
    `,
    // Event handler parameters are not props/state
    dedent`
      import { useRef } from 'react';

      function Component() {
        const lastEventRef = useRef(null);
        return <input onChange={(e) => { lastEventRef.current = e.target.value; }} />;
      }
    `,
    // Common "fire only once" singleton pattern
    dedent`
      import { useRef, useEffect } from 'react';
      function Component() {
        const calledRef = useRef(false);
        useEffect(() => {
          if (!calledRef.current) {
            calledRef.current = true;
            // ...
          }
        })
      }
    `,
    // Common "fire only once when changes" pattern — enclosing if
    dedent`
      function Comp() {
        const pathname = usePathname();
        const calledPathnameRef = useRef(null);

        useEffect(() => {
          if (calledPathnameRef.current !== pathname) {
            calledPathnameRef.current = pathname;

            stuffLikeAnalytics();
          }
        }, [pathname]);
      }
    `,
    // Same pattern with an early-return guard
    dedent`
      function Comp() {
        const pathname = usePathname();
        const calledPathnameRef = useRef(null);

        useEffect(() => {
          if (calledPathnameRef.current === pathname) return;
          calledPathnameRef.current = pathname;

          stuffLikeAnalytics();
        }, [pathname]);
      }
    `,
    // Capturing a reactive snapshot into a ref from inside an event handler is
    // deliberate imperative capture, not a render/effect-time peek
    dedent`
      import { useRef, useCallback, useState } from 'react';
      function Component() {
        const [width, setWidth] = useState(0);
        const dragRef = useRef(null);
        const onStart = useCallback(() => {
          dragRef.current = { start: width };
        }, [width]);
        return null;
      }
    `,
    // Same, in a plain inline JSX handler
    dedent`
      import { useRef } from 'react';
      function Component({ value }) {
        const ref = useRef(null);
        return <button onClick={() => { ref.current = value; }} />;
      }
    `,

    dedent`
      import { useRef } from 'react';

      export function useTableColumnSizing({
        table,
        columnResizeMode = 'onEnd',
      }) {
        const [widths, setWidths] = useStateWithDeps<Record<string, number | undefined>>({});

        // The in-flight drag. The document listeners below are attached once per mount
        // and consult this ref — null means "no drag, bail immediately".
        const dragRef = useRef<ActiveDrag | null>(null);
        const startResize = useCallback(
          (columnId: string, event: React.MouseEvent<HTMLElement> | React.TouchEvent<HTMLElement>) => {
            const startClientX = getClientX(event.nativeEvent);
            if (startClientX === undefined) return;
            event.preventDefault();

            const column = table.columnsById.get(columnId);
            // measure the th when the column has no override and no declared width
            const startWidth =
              widths[columnId] ??
              column?.width ??
              (event.currentTarget.closest('th')?.getBoundingClientRect().width || MIN_COLUMN_WIDTH);

            dragRef.current = {
              columnId,
              startClientX,
              startWidth,
              minWidth: column?.resizeMinWidth ?? MIN_COLUMN_WIDTH,
              maxWidth: column?.resizeMaxWidth ?? Number.POSITIVE_INFINITY,
              pendingWidth: null,
            };
            setResizing({ resizingId: columnId });
          },
          [table, widths, setResizing],
        );
        return { startResize };
      }
    `
  ],
  invalid: [
    // The classic agent-written anti-pattern: effect syncing a prop into a ref
    {
      code: dedent`
        import { useRef, useEffect } from 'react';

        function Component({ value }) {
          const valueRef = useRef(value);
          useEffect(() => {
            valueRef.current = value;
          }, [value]);
          return null;
        }
      `,
      errors: [{ messageId: 'default', data: { kind: 'props' } }]
    },
    // Render-time mirror of state
    {
      code: dedent`
        import { useRef, useState } from 'react';

        function Component() {
          const [count] = useState(0);
          const countRef = useRef(0);
          countRef.current = count;
          return null;
        }
      `,
      errors: [{ messageId: 'default', data: { kind: 'state' } }]
    },
    // Storing a setter: a stable setter never needs a ref, an unstable one
    // is a changing hook return being peeked — wrong either way
    {
      code: dedent`
        import { useRef, useState } from 'react';

        function Component() {
          const [, setCount] = useState(0);
          const setterRef = useRef(null);
          setterRef.current = setCount;
          return null;
        }
      `,
      errors: [{ messageId: 'default', data: { kind: 'state' } }]
    },
    // Setter-style binding from a non-State hook
    {
      code: dedent`
        import { useRef } from 'react';
        import { useLocalStorage } from 'some-lib';

        function Component() {
          const [, setValue] = useLocalStorage('key');
          const ref = useRef(null);
          ref.current = setValue;
          return null;
        }
      `,
      errors: [{ messageId: 'default', data: { kind: 'a hook return value' } }]
    },
    // Derived computation is still a reactive snapshot
    {
      code: dedent`
        import { useRef, useState } from 'react';

        function Component() {
          const [count] = useState(0);
          const ref = useRef(0);
          ref.current = count + 1;
          return null;
        }
      `,
      errors: [{ messageId: 'default', data: { kind: 'state' } }]
    },
    // Wrapping in a fresh object literal is still mirroring
    {
      code: dedent`
        import { useRef, useState } from 'react';

        function Component() {
          const [count] = useState(0);
          const ref = useRef(null);
          ref.current = { count };
          return null;
        }
      `,
      errors: [{ messageId: 'default', data: { kind: 'state' } }]
    },
    // Template literal derivation
    {
      code: dedent`
        import { useRef } from 'react';

        function Component({ id }) {
          const ref = useRef('');
          ref.current = \`item-\${id}\`;
          return null;
        }
      `,
      errors: [{ messageId: 'default', data: { kind: 'props' } }]
    },
    // Unary negation of a prop
    {
      code: dedent`
        import { useRef } from 'react';

        function Component({ enabled }) {
          const ref = useRef(false);
          ref.current = !enabled;
          return null;
        }
      `,
      errors: [{ messageId: 'default', data: { kind: 'props' } }]
    },
    // Array literal wrap
    {
      code: dedent`
        import { useRef } from 'react';
        import { useQuery } from 'lib';

        function Component() {
          const data = useQuery('/api');
          const ref = useRef(null);
          ref.current = [data];
          return null;
        }
      `,
      errors: [{ messageId: 'default', data: { kind: 'a hook return value' } }]
    },
    // Hook return value
    {
      code: dedent`
        import { useRef, useEffect } from 'react';
        import { useQuery } from 'some-lib';

        function Component() {
          const data = useQuery('/api');
          const dataRef = useRef(null);
          useEffect(() => {
            dataRef.current = data;
          }, [data]);
          return null;
        }
      `,
      errors: [{ messageId: 'default', data: { kind: 'a hook return value' } }]
    },
    // Member path rooted at props
    {
      code: dedent`
        import { useRef, useLayoutEffect } from 'react';

        function Component(props) {
          const ref = useRef(null);
          useLayoutEffect(() => {
            ref.current = props.items[0];
          });
          return null;
        }
      `,
      errors: [{ messageId: 'default', data: { kind: 'props' } }]
    },
    // Destructured hook return
    {
      code: dedent`
        import { useRef } from 'react';
        import { useSWR } from 'swr';

        function Component() {
          const { data } = useSWR('/api');
          const ref = useRef(null);
          ref.current = data;
          return null;
        }
      `,
      errors: [{ messageId: 'default', data: { kind: 'a hook return value' } }]
    },
    // Inside a custom hook — its arguments are reactive too
    {
      code: dedent`
        import { useRef, useEffect } from 'react';

        function useMyHook(value) {
          const ref = useRef(value);
          useEffect(() => {
            ref.current = value;
          }, [value]);
          return ref;
        }
      `,
      errors: [{ messageId: 'default', data: { kind: 'props' } }]
    },
    // React.useRef + use*State variant hook
    {
      code: dedent`
        import React from 'react';
        import { useCustomState } from 'lib';

        function Component() {
          const [value] = useCustomState(0);
          const ref = React.useRef(null);
          ref.current = value;
          return null;
        }
      `,
      errors: [{ messageId: 'default', data: { kind: 'state' } }]
    },
    // Arrow function component
    {
      code: dedent`
        import { useRef } from 'react';

        const Component = ({ enabled }) => {
          const ref = useRef(false);
          ref.current = enabled;
          return null;
        };
      `,
      errors: [{ messageId: 'default', data: { kind: 'props' } }]
    },
    // real pattern collected by real project
    {
      code: dedent`
        import { useRef, useEffect } from 'react';
        import { useOnboardingId } from 'contexts';
        const onboardingId = useOnboardingId();
        const onboardingIdRef = useRef(onboardingId);
        useEffect(() => {
          onboardingIdRef.current = onboardingId;
        });
      `,
      errors: [{ messageId: 'default', data: { kind: 'a hook return value' } }]
    },
    // real pattern collected by real project
    {
      code: dedent`
        import { useEffect, useRef } from "react";
        import { useSWRConfig } from "swr";
        import { useActiveOrganization } from "contexts";

        export function OrgChangeRevalidator() {
          const { mutate } = useSWRConfig();
          const { data: org } = useActiveOrganization();
          const orgId = org?.id ?? null;
          const prevOrgIdRef = useRef<string | null>(null);

          useEffect(() => {
            const prev = prevOrgIdRef.current;
            if (prev != null && prev !== orgId) {
              mutate(() => true);
            }
            prevOrgIdRef.current = orgId;
          }, [orgId, mutate]);

          return null;
        }
      `,
      errors: [{ messageId: 'default', data: { kind: 'a hook return value' } }]
    },
    {
      code: dedent`
        import { useRef, useEffect } from 'react';

        function Comp({
          onInput,
          onResize,
          onReady,
          onError
        }) {
          const onInputRef = useRef(onInput);
          const onResizeRef = useRef(onResize);
          const onReadyRef = useRef(onReady);
          const onErrorRef = useRef(onError);

          useEffect(() => {
            onInputRef.current = onInput;
            onResizeRef.current = onResize;
            onReadyRef.current = onReady;
            onErrorRef.current = onError;
          }, [onError, onInput, onReady, onResize]);
        }
      `,
      errors: [{ messageId: 'default', data: { kind: 'props' } }, { messageId: 'default', data: { kind: 'props' } }, { messageId: 'default', data: { kind: 'props' } }, { messageId: 'default', data: { kind: 'props' } }]
    }
  ]
}, {}, false);
