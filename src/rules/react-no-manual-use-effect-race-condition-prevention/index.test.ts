import { dedent } from 'ts-dedent';
import mod from '.';
import { runTest } from '@test/run-test';

runTest({
  module: mod,
  invalid: [
    {
      code: dedent`
        import { useEffect, useState } from "react";

        function Component() {
          const [done, setDone] = useState(false);

          useEffect(() => {
            let cancelled = false;

            Promise.resolve().then(() => {
              if (!cancelled) {
                setDone(true);
              }
            });

            return () => {
              cancelled = true;
            };
          }, []);

          return null;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // Variant: `cancel` name, cleanup as block
    {
      code: dedent`
        function App() {
          useEffect(() => {
            let cancel = false;
            fetch('/api').then(res => {
              if (!cancel) {
                setData(res);
              }
            });
            return () => { cancel = true; };
          }, []);
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // Variant: `ignore` name, with deps
    {
      code: dedent`
        function App() {
          useEffect(() => {
            let ignore = false;
            fetchData().then(result => {
              if (!ignore) {
                setState(result);
              }
            });
            return () => { ignore = true; };
          }, [url]);
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // Variant: cleanup as arrow expression body, no block
    {
      code: dedent`
        function App() {
          useEffect(() => {
            let active = false;
            if (!active) { doWork(); }
            return () => active = true;
          }, []);
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // Inverted polarity: `let active = true` guarded by a truthy read,
    // cleanup assigning `false`
    {
      code: dedent`
        function App() {
          useEffect(() => {
            let active = true;
            fetch('/api').then(res => {
              if (active) { setData(res); }
            });
            return () => { active = false; };
          }, []);
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // Cleanup writes a non-literal truthy value (`!0`)
    {
      code: dedent`
        function App() {
          useEffect(() => {
            let cancelled = false;
            fetch('/api').then(res => {
              if (!cancelled) setData(res);
            });
            return () => { cancelled = !0; };
          }, []);
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // Guard via logical-and rather than an if statement
    {
      code: dedent`
        function App() {
          useEffect(() => {
            let cancelled = false;
            fetch('/api').then(res => {
              !cancelled && setData(res);
            });
            return () => { cancelled = true; };
          }, []);
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // Early-return guard
    {
      code: dedent`
        function App() {
          useEffect(() => {
            let cancelled = false;
            fetch('/api').then(res => {
              if (cancelled) return;
              setData(res);
            });
            return () => { cancelled = true; };
          }, []);
        }
      `,
      errors: [{ messageId: 'default' }]
    }
  ],
  valid: [
    // Already using foxact/use-abortable-effect
    dedent`
      import { useAbortableEffect } from 'foxact/use-abortable-effect';
      function App() {
        useAbortableEffect((signal) => {
          fetch('/api', { signal });
        }, []);
      }
    `,
    // useEffect without any cancel pattern
    dedent`
      function App() {
        useEffect(() => {
          console.log('hello');
          return () => console.log('bye');
        }, []);
      }
    `,
    // Flag written in cleanup but never read as a guard
    dedent`
      function App() {
        useEffect(() => {
          let cancel = false;
          console.log(cancel);
          return () => { cancel = true; };
        }, []);
      }
    `,
    // No cleanup function at all
    dedent`
      function App() {
        useEffect(() => {
          let cancel = false;
          if (!cancel) { fetch('/api'); }
        }, []);
      }
    `,
    // Effect callback takes a param (custom hook already supplying a signal)
    dedent`
      function App() {
        useEffect((signal) => {
          let cancel = false;
          if (!cancel) {}
          return () => { cancel = true; };
        }, []);
      }
    `,
    dedent`
      import { useEffect, useState } from "react";

      function Component() {
        const [v, setV] = useState();

        useEffect((signal) => {
          let initRead = false;

          someReadAsync().then((v) => {
            if (signal.aborted) return;
            initRead = true;
            setV(v);
          });

          const off = onSomething((v) => {
            if (!initRead) return;
            if (signal.aborted) return;
            setV(v);
          })

          return () => {
            // this way the onSomething call get extra ignore guard
            initRead = false;
          };
        }, []);

        return null;
      }
    `,
    dedent`
      import { useEffect, useState } from "react";

      function Component() {
        const [done, setDone] = useState(false);

        useEffect(() => {
          let cancelled = false;
          console.log(cancelled);

          return () => {
            cancelled = true;
          };
        }, []);

        return done;
      }
    `
  ]
}, {}, false);
