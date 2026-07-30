import mod from '.';
import { runTest } from '@test/run-test';
import { dedent } from 'ts-dedent';

runTest({
  module: mod,
  valid: [
    // Already using foxact/use-abortable-effect
    dedent`
      import { useEffect } from 'foxact/use-abortable-effect';

      function Component() {
        useEffect((signal) => {
          window.addEventListener('scroll', handleScroll, { signal });
        }, []);
      }
    `,
    // There is no manual EventTarget cleanup to replace.
    dedent`
      import { useEffect } from 'react';

      function Component() {
        useEffect(() => {
          window.addEventListener('scroll', handleScroll);
        }, []);
      }
    `,
    // The cleanup removes a different listener.
    dedent`
      import { useEffect } from 'react';

      function Component() {
        useEffect(() => {
          window.addEventListener('scroll', handleScroll);
          return () => {
            window.removeEventListener('scroll', anotherHandler);
          };
        }, []);
      }
    `,
    // Capture mode is part of listener identity.
    dedent`
      import { useEffect } from 'react';

      function Component() {
        useEffect(() => {
          window.addEventListener('scroll', handleScroll, true);
          return () => {
            window.removeEventListener('scroll', handleScroll, false);
          };
        }, []);
      }
    `,
    // A same-named local function is not React's hook.
    dedent`
      function useEffect(callback) {
        callback();
      }

      useEffect(() => {
        window.addEventListener('scroll', handleScroll);
        return () => {
          window.removeEventListener('scroll', handleScroll);
        };
      });
    `,
    // Nested cleanup control flow is intentionally left alone.
    dedent`
      import { useEffect } from 'react';

      function Component({ enabled }) {
        useEffect(() => {
          window.addEventListener('scroll', handleScroll);
          return () => {
            if (enabled) {
              window.removeEventListener('scroll', handleScroll);
            }
          };
        }, [enabled]);
      }
    `,
    // A dynamic capture value cannot be proven to match at lint time.
    dedent`
      import { useEffect } from 'react';

      declare const shouldCapture: boolean;

      function Component() {
        useEffect(() => {
          window.addEventListener('scroll', handleScroll, { capture: shouldCapture });
          return () => {
            window.removeEventListener('scroll', handleScroll, { capture: shouldCapture });
          };
        }, []);
      }
    `,
    // An invalid non-boolean capture shape is left to TypeScript/the browser.
    dedent`
      import { useEffect } from 'react';

      function Component() {
        useEffect(() => {
          window.addEventListener('scroll', handleScroll, { capture: 'yes' });
          return () => {
            window.removeEventListener('scroll', handleScroll, { capture: 'yes' });
          };
        }, []);
      }
    `
  ],
  invalid: [
    {
      code: dedent`
        import { useEffect, useState } from 'react';

        function Component() {
          const [, forceUpdate] = useState({});

          useEffect(() => {
            const handleKeyDown = (event) => {
              if (event.key === 'Escape') forceUpdate({});
            };
            const handleScroll = () => forceUpdate({});

            window.addEventListener('scroll', handleScroll, { passive: true });
            window.addEventListener('keydown', handleKeyDown, { passive: true });

            return () => {
              window.removeEventListener('scroll', handleScroll);
              window.removeEventListener('keydown', handleKeyDown);
            };
          }, []);
        }
      `,
      output: dedent`
        import { useState } from 'react';
        import { useEffect } from 'foxact/use-abortable-effect';

        function Component() {
          const [, forceUpdate] = useState({});

          useEffect((signal) => {
            const handleKeyDown = (event) => {
              if (event.key === 'Escape') forceUpdate({});
            };
            const handleScroll = () => forceUpdate({});

            window.addEventListener('scroll', handleScroll, { passive: true, signal });
            window.addEventListener('keydown', handleKeyDown, { passive: true, signal });
          }, []);
        }
      `,
      errors: [{ messageId: 'eventTarget' }]
    },
    {
      // Object-form capture is part of listener identity and is preserved.
      code: dedent`
        import { useEffect } from 'react';

        function Component() {
          useEffect(() => {
            window.addEventListener('focus', handleFocus, { capture: true, passive: true });
            return () => {
              window.removeEventListener('focus', handleFocus, { capture: true });
            };
          }, []);
        }
      `,
      output: dedent`
        import { useEffect } from 'foxact/use-abortable-effect';

        function Component() {
          useEffect((signal) => {
            window.addEventListener('focus', handleFocus, { capture: true, passive: true, signal });
          }, []);
        }
      `,
      errors: [{ messageId: 'eventTarget' }]
    },
    {
      // Removing a conditional cleanup must preserve the branch's early exit;
      // otherwise otherSideEffect would begin running when isEnabled is true.
      code: dedent`
        import { useEffect } from 'react';

        function Component({ isEnabled }) {
          useEffect(() => {
            if (isEnabled) {
              window.addEventListener('scroll', handleScroll);
              return () => window.removeEventListener('scroll', handleScroll);
            }
            otherSideEffect();
          }, [isEnabled]);
        }
      `,
      output: dedent`
        import { useEffect } from 'foxact/use-abortable-effect';

        function Component({ isEnabled }) {
          useEffect((signal) => {
            if (isEnabled) {
              window.addEventListener('scroll', handleScroll, { signal });
              return;
            }
            otherSideEffect();
          }, [isEnabled]);
        }
      `,
      errors: [{ messageId: 'eventTarget' }]
    },
    {
      // A direct cleanup return can still have unreachable statements after
      // it. Preserve the return so the fixer does not make them executable.
      code: dedent`
        import { useEffect } from 'react';

        function Component() {
          useEffect(() => {
            window.addEventListener('scroll', handleScroll);
            return () => window.removeEventListener('scroll', handleScroll);
            otherSideEffect();
          }, []);
        }
      `,
      output: dedent`
        import { useEffect } from 'foxact/use-abortable-effect';

        function Component() {
          useEffect((signal) => {
            window.addEventListener('scroll', handleScroll, { signal });
            return;
            otherSideEffect();
          }, []);
        }
      `,
      errors: [{ messageId: 'eventTarget' }]
    },
    {
      // Each conditional cleanup is fixed independently and keeps its own
      // early return.
      code: dedent`
        import { useEffect } from 'react';

        function Component({ mode }) {
          useEffect(() => {
            if (mode === 'scroll') {
              window.addEventListener('scroll', handleScroll);
              return () => window.removeEventListener('scroll', handleScroll);
            }
            if (mode === 'keyboard') {
              window.addEventListener('keydown', handleKeyDown);
              return () => window.removeEventListener('keydown', handleKeyDown);
            }
            otherSideEffect();
          }, [mode]);
        }
      `,
      output: dedent`
        import { useEffect } from 'foxact/use-abortable-effect';

        function Component({ mode }) {
          useEffect((signal) => {
            if (mode === 'scroll') {
              window.addEventListener('scroll', handleScroll, { signal });
              return;
            }
            if (mode === 'keyboard') {
              window.addEventListener('keydown', handleKeyDown, { signal });
              return;
            }
            otherSideEffect();
          }, [mode]);
        }
      `,
      errors: [{ messageId: 'eventTarget' }]
    },
    {
      // Remove a trailing named specifier without disturbing the preceding one.
      code: dedent`
        import { useState, useEffect } from 'react';

        function Component() {
          useEffect(() => {
            window.addEventListener('scroll', handleScroll);
            return () => {
              window.removeEventListener('scroll', handleScroll);
            };
          }, []);
        }
      `,
      output: dedent`
        import { useState } from 'react';
        import { useEffect } from 'foxact/use-abortable-effect';

        function Component() {
          useEffect((signal) => {
            window.addEventListener('scroll', handleScroll, { signal });
          }, []);
        }
      `,
      errors: [{ messageId: 'eventTarget' }]
    },
    {
      // Removing the only named specifier must preserve the default import.
      code: dedent`
        import React, { useEffect } from 'react';

        function Component() {
          useEffect(() => {
            window.addEventListener('scroll', handleScroll);
            return () => {
              window.removeEventListener('scroll', handleScroll);
            };
          }, []);
        }
      `,
      output: dedent`
        import React from 'react';
        import { useEffect } from 'foxact/use-abortable-effect';

        function Component() {
          useEffect((signal) => {
            window.addEventListener('scroll', handleScroll, { signal });
          }, []);
        }
      `,
      errors: [{ messageId: 'eventTarget' }]
    },
    {
      code: dedent`
        import { useEffect } from "react";

        function Component() {
          useEffect(() => {
            document.addEventListener('visibilitychange', handleVisibility);
            return () => document.removeEventListener('visibilitychange', handleVisibility);
          }, []);
        }
      `,
      output: dedent`
        import { useEffect } from "foxact/use-abortable-effect";

        function Component() {
          useEffect((signal) => {
            document.addEventListener('visibilitychange', handleVisibility, { signal });
          }, []);
        }
      `,
      errors: [{ messageId: 'eventTarget' }]
    },
    {
      // When foxact is already imported, remove the now-empty React import
      // instead of leaving it behind or creating a duplicate foxact import.
      code: dedent`
        import { useEffect } from 'react';
        import { something } from 'foxact/use-abortable-effect';

        function Component() {
          useEffect(() => {
            window.addEventListener('scroll', handleScroll);
            return () => {
              window.removeEventListener('scroll', handleScroll);
            };
          }, []);
        }
      `,
      output: dedent`
        import { something, useEffect } from 'foxact/use-abortable-effect';

        function Component() {
          useEffect((signal) => {
            window.addEventListener('scroll', handleScroll, { signal });
          }, []);
        }
      `,
      errors: [{ messageId: 'eventTarget' }]
    },
    {
      code: dedent`
        import { useEffect } from 'react';

        function Component() {
          useEffect(() => {
            window.addEventListener('focus', handleFocus, true);
            return () => {
              window.removeEventListener('focus', handleFocus, true);
            };
          }, []);
        }
      `,
      output: dedent`
        import { useEffect } from 'foxact/use-abortable-effect';

        function Component() {
          useEffect((signal) => {
            window.addEventListener('focus', handleFocus, { capture: true, signal });
          }, []);
        }
      `,
      errors: [{ messageId: 'eventTarget' }]
    },
    {
      // Adding a `signal` parameter would shadow the component parameter, so
      // report the pattern without applying a speculative alternative name.
      code: dedent`
        import { useEffect } from 'react';

        function Component() {
          useEffect(() => {
            window.addEventListener('scroll', handleScroll, {});
            return () => {
              window.removeEventListener('scroll', handleScroll);
              unsubscribe();
            };
          }, []);
        }
      `,
      output: dedent`
        import { useEffect } from 'foxact/use-abortable-effect';

        function Component() {
          useEffect((signal) => {
            window.addEventListener('scroll', handleScroll, { signal });
            return () => {
              unsubscribe();
            };
          }, []);
        }
      `,
      errors: [{ messageId: 'eventTarget' }]
    },
    {
      code: dedent`
        import { useEffect } from 'foxact/use-abortable-effect';

        function Component() {
          useEffect((abortSignal) => {
            window.addEventListener('resize', handleResize, { passive: true });
            return () => {
              window.removeEventListener('resize', handleResize);
            };
          }, []);
        }
      `,
      output: dedent`
        import { useEffect } from 'foxact/use-abortable-effect';

        function Component() {
          useEffect((abortSignal) => {
            window.addEventListener('resize', handleResize, { passive: true, signal: abortSignal });
          }, []);
        }
      `,
      errors: [{ messageId: 'eventTarget' }]
    },
    {
      code: dedent`
        import { useEffect, useState } from 'react';
        import { something } from 'foxact/use-abortable-effect';

        function Component() {
          useEffect(() => {
            window.addEventListener('scroll', handleScroll);
            return () => {
              window.removeEventListener('scroll', handleScroll);
            };
          }, []);
        }
      `,
      output: dedent`
        import { useState } from 'react';
        import { something, useEffect } from 'foxact/use-abortable-effect';

        function Component() {
          useEffect((signal) => {
            window.addEventListener('scroll', handleScroll, { signal });
          }, []);
        }
      `,
      errors: [{ messageId: 'eventTarget' }]
    },
    {
      code: dedent`
        import { useEffect } from 'react';

        function Component(signal) {
          useEffect(() => {
            console.log(signal);
            window.addEventListener('scroll', handleScroll);
            return () => {
              window.removeEventListener('scroll', handleScroll);
            };
          }, [signal]);
        }
      `,
      output: null,
      errors: [{ messageId: 'eventTarget' }]
    },
    {
      // The pattern is reported, but an unusual callback parameter cannot be
      // safely rewritten into the signal binding expected by the hook.
      code: dedent`
        import { useEffect } from 'react';

        function Component() {
          useEffect(({ signal }) => {
            window.addEventListener('scroll', handleScroll);
            return () => {
              window.removeEventListener('scroll', handleScroll);
            };
          }, []);
        }
      `,
      output: null,
      errors: [{ messageId: 'eventTarget' }]
    }
  ]
}, {}, false);

// With typed linting, only receivers assignable to the DOM EventTarget
// interface are reported. The untyped suite above retains the syntax fallback.
runTest({
  module: mod,
  valid: [
    dedent`
      import { useEffect } from 'react';

      interface Subscription {
        addEventListener(name: string, listener: () => void): void,
        removeEventListener(name: string, listener: () => void): void
      }

      declare const subscription: Subscription;
      declare const listener: () => void;

      function Component() {
        useEffect(() => {
          subscription.addEventListener('change', listener);
          return () => {
            subscription.removeEventListener('change', listener);
          };
        }, []);
      }
    `,
    // `any` is not positive proof that the receiver is an EventTarget.
    dedent`
      import { useEffect } from 'react';

      declare const target: any;

      function Component() {
        useEffect(() => {
          target.addEventListener('change', listener);
          return () => {
            target.removeEventListener('change', listener);
          };
        }, []);
      }
    `,
    // Every union constituent must be an EventTarget.
    dedent`
      import { useEffect } from 'react';

      interface Subscription {
        addEventListener(name: string, listener: EventListener): void,
        removeEventListener(name: string, listener: EventListener): void
      }

      declare const target: EventTarget | Subscription;
      declare const listener: EventListener;

      function Component() {
        useEffect(() => {
          target.addEventListener('change', listener);
          return () => {
            target.removeEventListener('change', listener);
          };
        }, []);
      }
    `
  ],
  invalid: [
    {
      code: dedent`
        import { useEffect } from 'react';

        declare const target: EventTarget;
        declare const listener: EventListener;

        function Component() {
          useEffect(() => {
            target.addEventListener('change', listener, { passive: true });
            return () => {
              target.removeEventListener('change', listener);
            };
          }, []);
        }
      `,
      output: dedent`
        import { useEffect } from 'foxact/use-abortable-effect';

        declare const target: EventTarget;
        declare const listener: EventListener;

        function Component() {
          useEffect((signal) => {
            target.addEventListener('change', listener, { passive: true, signal });
          }, []);
        }
      `,
      errors: [{ messageId: 'eventTarget' }]
    },
    {
      code: dedent`
        import { useEffect } from 'react';

        class Source extends EventTarget {}
        declare const source: Source;
        declare const listener: EventListener;

        function Component() {
          useEffect(() => {
            source.addEventListener('change', listener);
            return () => source.removeEventListener('change', listener);
          }, []);
        }
      `,
      output: dedent`
        import { useEffect } from 'foxact/use-abortable-effect';

        class Source extends EventTarget {}
        declare const source: Source;
        declare const listener: EventListener;

        function Component() {
          useEffect((signal) => {
            source.addEventListener('change', listener, { signal });
          }, []);
        }
      `,
      errors: [{ messageId: 'eventTarget' }]
    }
  ]
});
