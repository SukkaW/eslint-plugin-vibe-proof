import mod from '.';
import { runTest } from '@test/run-test';
import { dedent } from 'ts-dedent';

runTest({
  module: mod,
  valid: [
    dedent`
      function Component({ storage }) {
        storage.getItem('foo');
        return null;
      }
    `,
    dedent`
      function Component() {
        const localStorage = createStorage();
        localStorage.getItem('foo');
        return null;
      }
    `,
    dedent`
      function Component() {
        const sessionStorage = createStorage();
        return sessionStorage;
      }
    `,
    // A third-party storage library that happens to expose a `localStorage`
    // binding is not the browser global
    dedent`
      import { localStorage } from 'localstorage-polyfill';
      function Component() {
        return localStorage.getItem('foo');
      }
    `,
    dedent`
      import { sessionStorage } from 'localstorage-polyfill';
      function Component() {
        return sessionStorage.getItem('foo');
      }
    `,
    // Namespace import — `store.localStorage` is a library object
    dedent`
      import * as store from 'store2';
      function Component() {
        return store.localStorage.getItem('foo');
      }
    `,
    // A third-party object exposing a `localStorage` property
    dedent`
      import { storage } from '@vueuse/core';
      function Component() {
        return storage.localStorage.getItem('foo');
      }
    `,
    // A non-foxact persistence solution is a perfectly good answer to the
    // problem this rule points at — it must not be second-guessed.
    dedent`
      import { useLocalStorageState } from 'ahooks';
      function Component() {
        const [value] = useLocalStorageState('key');
        return <div>{value}</div>;
      }
    `,
    dedent`
      import { useLocalStorage } from 'usehooks-ts';
      function Component() {
        const [value, setValue] = useLocalStorage('key', '');
        return <div>{value}</div>;
      }
    `,
    // Returning a same-named hook from another library: there is no foxact
    // create-*-storage-state counterpart to migrate to, so the
    // returnLocalStorage advice does not apply.
    dedent`
      import { useLocalStorage } from 'react-use';
      function useSharedStorage() {
        return useLocalStorage('key', '');
      }
    `,
    dedent`
      import { useSessionStorage } from 'usehooks-ts';
      function useSharedStorage() {
        return useSessionStorage('key', '');
      }
    `,
    // Aliased import from another library
    dedent`
      import { useLocalStorage as useStored } from 'react-use';
      const useShared = () => useStored('key', '');
    `,
    // Unresolved origin — no import to tie the hook to foxact, so the
    // create-*-storage-state advice cannot be shown to apply
    dedent`
      function useSharedStorage() {
        return useLocalStorage('key', '');
      }
    `,
    dedent`
      function useSharedStorage() {
        return useSessionStorage('key', '');
      }
    `,
    dedent`
      const useShared = () => useLocalStorage('key', '');
    `,
    // Locally defined hook of the same name
    dedent`
      function useLocalStorage(key, initial) {
        return [initial, () => {}];
      }
      const useShared = () => useLocalStorage('key', '');
    `,
    // State managers that persist for you
    dedent`
      import { atomWithStorage } from 'jotai/utils';
      const themeAtom = atomWithStorage('theme', 'light');
      function Component() {
        const [theme] = useAtom(themeAtom);
        return <div>{theme}</div>;
      }
    `,
    dedent`
      import { persist } from 'zustand/middleware';
      const useStore = create(persist((set) => ({ count: 0 }), { name: 'store' }));
      function Component() {
        const count = useStore((s) => s.count);
        return <div>{count}</div>;
      }
    `,
    // Locally required (CJS) shim
    dedent`
      const { localStorage } = require('localstorage-polyfill');
      function Component() {
        return localStorage.getItem('foo');
      }
    `,
    // useLocalStorage result used locally, not returned
    dedent`
      function Component() {
        const [value, setValue] = useLocalStorage('key', '');
        return <div>{value}</div>;
      }
    `,
    // useSessionStorage result used locally, not returned
    dedent`
      function Component() {
        const [value, setValue] = useSessionStorage('key', '');
        return <div>{value}</div>;
      }
    `,
    // react-hook-form asyncValues supports reading from external system for initial form values, it is allowed to read from localStorage
    dedent`
      function Component() {
        const form = useForm({
          asyncValues() {
            const a = localStorage.getItem('foo');
            const b = localStorage.getItem('bar');
            return Promise.resolve({ a, b });
          }
        })
      }
    `,
    // Event handler read/write — does not feed render, no subscription needed
    dedent`
      function Component() {
        const onClick = () => {
          localStorage.setItem('count', String(Date.now()));
        };
        return <button onClick={onClick} />;
      }
    `,
    // One-shot read inside an effect — not a render-path subscription
    dedent`
      function Component() {
        useEffect(() => {
          const seen = sessionStorage.getItem('seen');
          if (!seen) track();
        }, []);
        return null;
      }
    `
  ],
  invalid: [
    {
      code: dedent`
        function Component() {
          localStorage.getItem('foo');
          return null;
        }
      `,
      errors: [{ messageId: 'local' }]
    },
    // Storage read directly inside a dependency array — expects reactivity but
    // deps won't re-compare on storage change
    {
      code: dedent`
        function Component() {
          useEffect(() => {}, [localStorage.getItem('k')]);
          return null;
        }
      `,
      errors: [{ messageId: 'local' }]
    },
    // One-hop: read inside a callback, result wired into a dependency array
    {
      code: dedent`
        function Component() {
          const getV = () => localStorage.getItem('k');
          useEffect(() => {}, [getV()]);
          return null;
        }
      `,
      errors: [{ messageId: 'local' }]
    },
    // One-hop: the callback itself listed as a dep
    {
      code: dedent`
        function Component() {
          const read = () => sessionStorage.getItem('k');
          const memo = useMemo(() => compute(), [read]);
          return null;
        }
      `,
      errors: [{ messageId: 'session' }]
    },
    {
      code: dedent`
        function Component() {
          sessionStorage.setItem('foo', 'bar');
          return null;
        }
      `,
      errors: [{ messageId: 'session' }]
    },
    {
      code: dedent`
        function Component() {
          const storage = window.localStorage;
          return storage;
        }
      `,
      errors: [{ messageId: 'local' }]
    },
    {
      code: dedent`
        function Component() {
          globalThis.sessionStorage.removeItem('foo');
          return null;
        }
      `,
      errors: [{ messageId: 'session' }]
    },
    {
      code: dedent`
        function Component() {
          const storage = localStorage;
          return storage;
        }
      `,
      errors: [{ messageId: 'local' }]
    },
    {
      code: dedent`
        function Component() {
          self.sessionStorage.removeItem('foo');
          return null;
        }
      `,
      errors: [{ messageId: 'session' }]
    },
    // return foxact's useLocalStorage() directly
    {
      code: dedent`
        import { useLocalStorage } from 'foxact/use-local-storage';
        function useSharedStorage() {
          return useLocalStorage('key', '');
        }
      `,
      errors: [{ messageId: 'returnLocalStorage' }]
    },
    // return foxact's useSessionStorage() directly
    {
      code: dedent`
        import { useSessionStorage } from 'foxact/use-session-storage';
        function useSharedStorage() {
          return useSessionStorage('key', '');
        }
      `,
      errors: [{ messageId: 'returnSessionStorage' }]
    },
    // arrow function returning foxact's useLocalStorage
    {
      code: dedent`
        import { useLocalStorage } from 'foxact/use-local-storage';
        const useShared = () => useLocalStorage('key', '');
      `,
      errors: [{ messageId: 'returnLocalStorage' }]
    },
    // Aliased foxact import still resolves through scope analysis
    {
      code: dedent`
        import { useLocalStorage as useStored } from 'foxact/use-local-storage';
        const useShared = () => useStored('key', '');
      `,
      errors: [{ messageId: 'returnLocalStorage' }]
    },
    // Bare package specifier, not a subpath
    {
      code: dedent`
        import { useSessionStorage } from 'foxact';
        function useSharedStorage() {
          return useSessionStorage('key', '');
        }
      `,
      errors: [{ messageId: 'returnSessionStorage' }]
    }
  ]
}, {}, false);
