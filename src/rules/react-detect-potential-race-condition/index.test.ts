import mod from '.';
import { runTest } from '@test/run-test';
import { dedent } from 'ts-dedent';

runTest({
  module: mod,
  valid: [
    // Synchronous setState — wrong, but not this rule's concern
    dedent`
      import { useEffect, useState } from 'react';

      function Component({ id }) {
        const [data, setData] = useState(null);
        useEffect(() => {
          setData(id);
        }, [id]);
        return null;
      }
    `,
    // Abortable-effect signal, checked before the update
    dedent`
      import { useEffect } from 'foxact/use-abortable-effect';
      import { useState } from 'react';

      function Component({ dataKey }) {
        const [data, setData] = useState(null);
        useEffect((signal) => {
          fetchData(dataKey).then((data) => {
            if (signal.aborted) return;
            setData(data);
          });
        }, [dataKey]);
        return null;
      }
    `,
    // Any effect-callback parameter marks an abortable-effect variant: the
    // developer already owns cancellation, so the whole effect is skipped even
    // if this particular update isn't explicitly guarded.
    dedent`
      import { useEffect } from 'foxact/use-abortable-effect';
      import { useState } from 'react';

      function Component({ dataKey }) {
        const [data, setData] = useState(null);
        useEffect((signal) => {
          fetchData(dataKey).then((data) => {
            setData(data);
          });
        }, [dataKey]);
        return null;
      }
    `,
    // Event-listener handlers are a subscription-lifecycle concern (handled by
    // the unsubscribe rule), not a stale-response race.
    dedent`
      import { useEffect, useState } from 'react';

      function Component({ dataKey }) {
        const [value, setValue] = useState(null);
        useEffect(() => {
          source.addEventListener('message', (e) => {
            setValue(e.data);
          });
          return () => source.removeEventListener('message', handler);
        }, [dataKey]);
        return null;
      }
    `,
    // Cancellation flag pattern, cleared in cleanup
    dedent`
      import { useEffect, useState } from 'react';

      function Component({ dataKey }) {
        const [data, setData] = useState(null);
        useEffect(() => {
          let isCancelled = false;
          fetchData(dataKey).then((data) => {
            if (!isCancelled) {
              setData(data);
            }
          });
          return () => { isCancelled = true; };
        }, [dataKey]);
        return null;
      }
    `,
    // Cancellation flag with async/await
    dedent`
      import { useEffect, useState } from 'react';

      function Component({ dataKey }) {
        const [data, setData] = useState(null);
        useEffect(() => {
          let cancelled = false;
          async function run() {
            const result = await fetchData(dataKey);
            if (cancelled) return;
            setData(result);
          }
          run();
          return () => { cancelled = true; };
        }, [dataKey]);
        return null;
      }
    `,
    // Signal guard with async/await
    dedent`
      import { useEffect } from 'foxact/use-abortable-effect';
      import { useState } from 'react';

      function Component({ dataKey }) {
        const [data, setData] = useState(null);
        useEffect((signal) => {
          (async () => {
            const result = await fetchData(dataKey);
            if (signal.aborted) return;
            setData(result);
          })();
        }, [dataKey]);
        return null;
      }
    `,
    // setState before any await is synchronous — no race
    dedent`
      import { useEffect, useState } from 'react';

      function Component() {
        const [loading, setLoading] = useState(false);
        useEffect(() => {
          async function run() {
            setLoading(true);
            await fetchData();
          }
          run();
        }, []);
        return null;
      }
    `,
    // Not a setState call (regular async side effect)
    dedent`
      import { useEffect } from 'react';

      function Component({ dataKey }) {
        useEffect(() => {
          fetchData(dataKey).then((data) => {
            console.log(data);
          });
        }, [dataKey]);
        return null;
      }
    `,
    // setState inside a synchronous iteration callback — runs inline, no race
    dedent`
      import { useEffect, useState } from 'react';

      function Component({ items }) {
        const [total, setTotal] = useState(0);
        useEffect(() => {
          items.forEach((item) => {
            setTotal(item.value);
          });
        }, [items]);
        return null;
      }
    `,
    // onSuccess callback, but guarded by a cancellation flag
    dedent`
      import { useEffect, useState } from 'react';

      function Component({ dataKey }) {
        const [data, setData] = useState(null);
        useEffect(() => {
          let cancelled = false;
          subscribe({ onSuccess(result) { if (!cancelled) setData(result); } });
          return () => { cancelled = true; };
        }, [dataKey]);
        return null;
      }
    `
  ],
  invalid: [
    // The canonical unguarded .then race
    {
      code: dedent`
        import { useEffect, useState } from 'react';

        function Component({ dataKey }) {
          const [data, setData] = useState(null);
          useEffect(() => {
            fetchData(dataKey).then((data) => {
              setData(data);
            });
          }, [dataKey]);
          return null;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // Unguarded async/await
    {
      code: dedent`
        import { useEffect, useState } from 'react';

        function Component({ dataKey }) {
          const [data, setData] = useState(null);
          useEffect(() => {
            async function run() {
              const result = await fetchData(dataKey);
              setData(result);
            }
            run();
          }, [dataKey]);
          return null;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // Async effect IIFE
    {
      code: dedent`
        import { useEffect, useState } from 'react';

        function Component({ dataKey }) {
          const [data, setData] = useState(null);
          useEffect(() => {
            (async () => {
              const result = await fetchData(dataKey);
              setData(result);
            })();
          }, [dataKey]);
          return null;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // .catch handler is also an async continuation
    {
      code: dedent`
        import { useEffect, useState } from 'react';

        function Component({ dataKey }) {
          const [error, setError] = useState(null);
          useEffect(() => {
            fetchData(dataKey).catch((err) => {
              setError(err);
            });
          }, [dataKey]);
          return null;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // A cancellation flag exists but the setState is NOT guarded by it
    {
      code: dedent`
        import { useEffect, useState } from 'react';

        function Component({ dataKey }) {
          const [data, setData] = useState(null);
          useEffect(() => {
            let cancelled = false;
            fetchData(dataKey).then((data) => {
              setData(data);
            });
            return () => { cancelled = true; };
          }, [dataKey]);
          return null;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    // Multiple setState after await, all unguarded
    {
      code: dedent`
        import { useEffect, useState } from 'react';

        function Component({ dataKey }) {
          const [data, setData] = useState(null);
          const [loading, setLoading] = useState(false);
          useEffect(() => {
            async function run() {
              const result = await fetchData(dataKey);
              setData(result);
              setLoading(false);
            }
            run();
          }, [dataKey]);
          return null;
        }
      `,
      errors: [{ messageId: 'default' }, { messageId: 'default' }]
    },
    // setState inside an onSuccess option callback — invoked asynchronously
    {
      code: dedent`
        import { useEffect, useState } from 'react';

        function Component({ dataKey }) {
          const [data, setData] = useState(null);
          useEffect(() => {
            someAsyncStuff({ onSuccess(result) { setData(result); } });
          }, [dataKey]);
          return null;
        }
      `,
      errors: [{ messageId: 'default' }]
    }
  ]
}, {}, false);
