import { dedent } from 'ts-dedent';
import mod from '.';
import { runTest } from '@test/run-test';

runTest({
  module: mod,
  invalid: [
    {
      code: dedent`
        import { useEffect, useState } from "react";

        function Component({ value }) {
          const [open, setOpen] = useState(false);
          useEffect(() => {
            setOpen(Boolean(value));
          }, [value]);
          return null;
        }
      `,
      errors: [{ messageId: 'watchStateWithProps' }]
    },
    {
      code: dedent`
        import { useEffect, useState } from "react";

        function Component(props) {
          const [open, setOpen] = useState(false);
          useEffect(() => {
            setOpen(Boolean(props.value));
          }, [props.value]);
          return null;
        }
      `,
      errors: [{ messageId: 'watchStateWithProps' }]
    },
    {
      code: dedent`
        import { useEffect, useState } from "react";

        function Component() {
          const [value, setValue] = useState(0);
          const [open, setOpen] = useState(false);
          useEffect(() => {
            setOpen(value > 0);
          }, [value]);
          return null;
        }
      `,
      errors: [{ messageId: 'watchState' }]
    },
    {
      code: dedent`
        import { useEffect, useState } from "react";

        function Component() {
          const [value, setValue] = useState(0);

          useEffect(() => {
            function sync() {
              setValue(1);
            }

            sync();
          }, []);

          return value;
        }
      `,
      errors: [{ messageId: 'watchState' }]
    },
    {
      code: dedent`
        import { useEffect, useState } from "react";

        function Component() {
          const [value, setValue] = useState(0);

          useEffect(() => {
            (() => {
              setValue(1);
            })();
          }, []);

          return value;
        }
      `,
      errors: [{ messageId: 'watchState' }]
    },
    // Arrow function assigned to variable then called synchronously
    {
      code: dedent`
        import { useEffect, useState } from "react";

        function Component() {
          const [value, setValue] = useState(0);

          useEffect(() => {
            const cb = () => {
              setValue(1);
            };
            cb();
          }, []);

          return value;
        }
      `,
      errors: [{ messageId: 'watchState' }]
    },
    // setState inside if/else — still synchronous
    {
      code: dedent`
        import { useEffect, useState } from "react";

        function Component({ resolvedId }) {
          const [storedId, setStoredId] = useState(null);
          useEffect(() => {
            if (resolvedId && resolvedId !== storedId) {
              setStoredId(resolvedId);
            }
          }, [resolvedId, storedId, setStoredId]);
          return null;
        }
      `,
      errors: [{ messageId: 'watchStateWithProps' }]
    },
    // Setter from useLocalStorage (non-useState hook)
    {
      code: dedent`
        import { useEffect } from "react";
        import { useLocalStorage } from "some-lib";

        function Component({ resolvedId }) {
          const [storedId, setStoredId] = useLocalStorage("key", null);
          useEffect(() => {
            if (resolvedId && resolvedId !== storedId) {
              setStoredId(resolvedId);
            }
          }, [resolvedId, storedId, setStoredId]);
          return null;
        }
      `,
      errors: [{ messageId: 'watchStateWithProps' }]
    },
    // Setter from useSetXxx() pattern (foxact/create-local-storage-state)
    {
      code: dedent`
        import { useEffect } from "react";
        import { useValue, useSetValue } from "./storage";

        function Component({ resolvedId }) {
          const storedId = useValue();
          const setStoredId = useSetValue();
          useEffect(() => {
            if (resolvedId !== storedId) {
              setStoredId(resolvedId);
            }
          }, [resolvedId, storedId, setStoredId]);
          return null;
        }
      `,
      errors: [{ messageId: 'watchStateWithProps' }]
    },
    // real code from real projects
    {
      code: dedent`
        function Comp({ host }: { host: HostProfile }): React.ReactNode {
          const setValue = useStore((state) => state.setValue);

          useEffect(() => {
            setValue(host.id);
          }, [host.id, setValue]);

          return null;
        }
      `,
      errors: [{ messageId: 'watchStateWithProps' }]
    },
    {
      code: dedent`
        import { useEffect } from "react";
        function Comp({ controller, connectionSource }) {
          useEffect(() => {
            controller.setSource(connectionSource);
          }, [connectionSource, controller]);
        }
      `,
      errors: [{ messageId: 'watchStateWithProps' }]
    },
    {
      code: dedent`
        function DirectiveStatePlugin({
          directiveControls,
          disabled,
        }: Pick<ComposerEditorProps, 'directiveControls' | 'disabled'>): null {
          const [editor] = useLexicalComposerContext();
          useEffect(() => {
            const store = directiveStateFor(editor);
            store.setState({ directiveControls, disabled });
          }, [editor, directiveControls, disabled]);
          return null;
        }
      `,
      errors: [{ messageId: 'watchStateWithProps' }]
    },
    // setState inside a synchronous iteration callback — should be `useMemo` instead
    {
      code: dedent`
        import { useEffect, useState } from "react";

        function Component({ items }) {
          const [value, setValue] = useState(0);
          useEffect(() => {
            items.forEach((item) => {
              setValue(item);
            });
          }, [items]);
          return value;
        }
      `,
      errors: [{ messageId: 'watchStateWithProps' }]
    },
    {
      code: dedent`
        import { useEffect, useState } from "react";

        function Component() {
          const [items, setItems] = useState([]);
          const [ids, setIds] = useState([]);
          useEffect(() => {
            items.map((item) => setIds((prev) => [...prev, item.id]));
          }, [items]);
          return ids;
        }
      `,
      errors: [{ messageId: 'watchState' }]
    },
    // copied from https://octanejs.dev/ homepage, a typical incorrect usage of useEffect watching state
    {
      code: dedent`
        import { useState, useEffect } from 'react';

        export function Counter(props) {
          const [count, setCount] = useState(0);


            useEffect(() => {
              console.log('count is now', count);
            }, [count]);

          <button onClick={() => setCount(count + 1)}>{'Count: ' + count}</button>
        }
      `,
      errors: [{ messageId: 'watchStateOnly' }]
    },
    // synchronously mirroring one hook's value into another store
    {
      code: dedent`
        import { useEffect } from 'react';
        import { useA, useSetB } from './store';

        function Component() {
          const a = useA();
          const setB = useSetB();

          useEffect(() => setB(a), [setB, a]);

          return null;
        }
      `,
      errors: [{ messageId: 'watchState' }]
    },
    // notifying the parent about a state change via effect — belongs in the
    // event handler that sets the state
    {
      code: dedent`
        import { useState, useEffect } from 'react';

        function Input({ onChange }) {
          const [value, setValue] = useState('');

          useEffect(() => {
            onChange(value);
          }, [value, onChange]);

          return <input value={value} onInput={(e) => setValue(e.target.value)} />;
        }
      `,
      errors: [{ messageId: 'watchStateOnly' }]
    },
    // setState in a immediate callback
    {
      code: dedent`
        function Comp() {
          const [currentScrollOffset, setCurrentScrollOffset] = useState(0);
          useEffect(() => {
            const handler = () => {
              setCurrentScrollOffset(window.scrollY);
            }

            handler();

            document.addEventListener('scroll', handler);
            return () => document.removeEventListener('scroll', handler);
          }, []);
        }
      `,
      errors: [{ messageId: 'watchState' }]
    }
  ],
  valid: [
    dedent`
      import { useEffect, useState } from "react";

      function Component() {
        const [value, setValue] = useState(0);
        return <button onClick={() => setValue(value + 1)}>Update</button>;
      }
    `,
    dedent`
      import { useEffect, useState } from "react";

      function Component() {
        const [value, setValue] = useState(0);

        useEffect(() => {
          async function sync() {
            setValue(1);
          }

          void sync();
        }, []);

        return value;
      }
    `,
    dedent`
      import { useEffect, useState } from "react";

      function Component() {
        const [value, setValue] = useState(0);

        useEffect(() => {
          Promise.resolve().then(() => {
            setValue(1);
          });
        }, []);

        return value;
      }
    `,
    dedent`
      import { useEffect, useState } from "react";

      function Component() {
        const [value, setValue] = useState(0);

        useEffect(() => {
          setTimeout(() => {
            setValue(1);
          }, 0);
        }, []);

        return value;
      }
    `,
    dedent`
      import { useEffect, useState } from "react";

      function Component() {
        const [value, setValue] = useState(0);

        useEffect(() => {
          (async () => {
            setValue(1);
          })();
        }, []);

        return value;
      }
    `,
    dedent`
      import { useEffect, useState, useRef } from "react";

      function Component() {
        const containerRef = useRef(null);
        const [isFixed, setIsFixed] = useState(false);

        useEffect(() => {
          const el = containerRef.current;
          const observer = new ResizeObserver((entries) => {
            setIsFixed(entries[0].contentRect.width < 500);
          });
          if (el) observer.observe(el);
          return () => observer.disconnect();
        }, []);

        return null;
      }
    `,
    dedent`
      import { useEffect, useState, useRef } from "react";

      function Component() {
        const ref = useRef(null);
        const [visible, setVisible] = useState(false);

        useEffect(() => {
          const observer = new IntersectionObserver(([entry]) => {
            setVisible(entry.isIntersecting);
          });
          if (ref.current) observer.observe(ref.current);
          return () => observer.disconnect();
        }, []);

        return null;
      }
    `,
    dedent`
      import { useEffect, useState, useRef } from "react";

      function Component() {
        const ref = useRef(null);
        const [changed, setChanged] = useState(false);

        useEffect(() => {
          const observer = new MutationObserver(() => {
            setChanged(true);
          });
          if (ref.current) observer.observe(ref.current, { childList: true });
          return () => observer.disconnect();
        }, []);

        return null;
      }
    `,
    dedent`
      import { useEffect, useState, useRef } from "react";

      function Component() {
        const buttonRef = useRef(null);
        const menuRef = useRef(null);
        const [isOpened, setIsOpened] = useState(false);

        useEffect(() => {
          const handleDocumentScroll = () => setIsOpened(false);
          const handleDocumentClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
            e.stopPropagation();
            setIsOpened(false);
          };

          document.addEventListener('click', handleDocumentClick);
          window.addEventListener('scroll', handleDocumentScroll);
          return () => {
            document.removeEventListener('click', handleDocumentClick);
            window.removeEventListener('scroll', handleDocumentScroll);
          };
        }, []);

        return null;
      }
    `,
    // lazy-load-once keyed on the watched state: the effect *writes* state
    // (deferred), so it is a loader, not a watcher
    dedent`
      import { useState } from 'react';
      import { useEffect } from 'foxact/use-abortable-effect';

      let promise;

      function Search() {
        const [searchIndex, setSearchIndex] = useState(null);
        const [searchIndexError, setSearchIndexError] = useState(null);

        useEffect((signal) => {
          if (!searchIndex) {
            (async () => {
              try {
                promise ||= loadSearchIndexImpl();
                const index = await promise;
                if (signal.aborted) return;
                setSearchIndex(() => index);
              } catch (error) {
                if (signal.aborted) return;
                setSearchIndexError(error);
              }
            })();
          }
        }, [searchIndex]);

        return searchIndex;
      }
    `,
    // post-render DOM access — cannot run at the setState call site because
    // the element is not committed yet
    dedent`
      import { useState, useEffect, useRef } from 'react';

      function Modal() {
        const inputRef = useRef(null);
        const [isOpen, setIsOpen] = useState(false);

        useEffect(() => {
          if (isOpen) {
            inputRef.current?.focus();
          }
        }, [isOpen]);

        return <input ref={inputRef} onClick={() => setIsOpen(true)} />;
      }
    `,
    // latest-ref pattern
    dedent`
      import { useState, useEffect, useRef } from 'react';

      function Component() {
        const [value, setValue] = useState(0);
        const latest = useRef(value);

        useEffect(() => {
          latest.current = value;
        }, [value]);

        return <button onClick={() => setValue(value + 1)} />;
      }
    `,
    // re-keyed subscription: cleanup returned
    dedent`
      import { useState, useEffect } from 'react';

      function Ticker() {
        const [delay, setDelay] = useState(1000);

        useEffect(() => {
          const id = setInterval(() => console.log('tick', delay), delay);
          return () => clearInterval(id);
        }, [delay]);

        return <button onClick={() => setDelay(delay * 2)} />;
      }
    `,
    // dep is a hook return, but not a strict use*State value slot
    dedent`
      import { useEffect } from 'react';
      import { useIntersection } from './use-intersection';

      function Component() {
        const [setIntersection, hasIntersected] = useIntersection({ rootMargin: '0px' });

        useEffect(() => {
          if (hasIntersected) return;
          runSideEffect();
        }, [hasIntersected]);

        return <div ref={setIntersection} />;
      }
    `,
    // dep comes from an object-destructured hook return, not a use*State tuple
    dedent`
      import { useEffect } from 'react';
      import { useEndpoints } from './endpoints';

      function Component() {
        const { data } = useEndpoints();

        useEffect(() => {
          if (data) {
            runSideEffect(data);
          }
        }, [data]);

        return null;
      }
    `,
    // dep is a state *setter*, not state
    dedent`
      import { useEffect } from 'react';
      import { useData, useSetData } from './data';

      function Component() {
        const data = useData();
        const setData = useSetData();

        useEffect(() => {
          sideEffect.then(setData);
        }, [setData]);

        return data;
      }
    `,
    // expression-bodied arrow may be returning a cleanup — skipped conservatively
    dedent`
      import { useState, useEffect } from 'react';
      import { subscribeTo } from './pubsub';

      function Component() {
        const [topic, setTopic] = useState('news');

        useEffect(() => subscribeTo(topic), [topic]);

        return <button onClick={() => setTopic('sports')} />;
      }
    `,
    dedent`
      import { useEffect } from "foxact/use-abortable-effect";
      import { useImmer } from 'use-immer';

      const [collect, setCollect] = useImmer([]);
      useEffect((signal) => {
        function onResp(data) {
          setCollect(draft => draft.push(data));
        }
        (async () => {
          for (let i = 0; i < 10; i++) {
            const data = await asyncStuff();
            if (signal.aborted) return;
            onResp(data);
          }
        })();
      });
    `
  ]
}, {}, false);

// with typed linting enabled, the receiver type of iteration-method callbacks
// is inspected instead of relying on the method name alone
runTest({
  module: mod,
  invalid: [
    {
      code: dedent`
        import { useEffect, useState } from 'react';

        function Component({ items }: { items: number[] }) {
          const [value, setValue] = useState(0);
          useEffect(() => {
            items.forEach((item) => {
              setValue(item);
            });
          }, [items]);
          return value;
        }
      `,
      errors: [{ messageId: 'watchStateWithProps' }]
    },
    {
      code: dedent`
        import { useEffect, useState } from 'react';

        function Component({ ids }: { ids: Set<number> }) {
          const [value, setValue] = useState(0);
          useEffect(() => {
            ids.forEach((id) => setValue(id));
          }, [ids]);
          return value;
        }
      `,
      errors: [{ messageId: 'watchStateWithProps' }]
    }
  ],
  valid: [
    // a custom `.map` that is not a synchronous collection iteration
    dedent`
      import { useEffect, useState } from 'react';

      interface Stream {
        map(callback: (value: number) => void): void
      }

      function Component({ stream }: { stream: Stream }) {
        const [value, setValue] = useState(0);
        useEffect(() => {
          stream.map((v) => setValue(v));
        }, [stream]);
        return value;
      }
    `
  ]
});
