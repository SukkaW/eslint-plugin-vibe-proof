import { dedent } from 'ts-dedent';
import mod from '.';
import { runTest } from '@test/run-test';

runTest({
  module: mod,
  invalid: [
    {
      code: dedent`
        import { useState } from "react";
        function Counter() {
          const [count, setCount] = useState(0);
          // ❌ Referencing count directly. Stale state risk.
          return (
            <button onClick={() => setCount(count + 1)}>
              {/*                           ^^^ Do not reference 'setCount' directly; use the updater function form instead. */}
              {count}
            </button>
          );
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    {
      code: dedent`
        import { useState } from "react";
        function Toggle() {
          const [enabled, setEnabled] = useState(false);
          // ❌ Negating state directly.
          return (
            <button onClick={() => setEnabled(!enabled)}>
              {/*                             ^^^ Do not reference 'setEnabled' directly; use the updater function form instead. */ }
              {enabled ? "On" : "Off"}
            </button>
          );
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    {
      code: dedent`
        import { useState } from "react";
        function UserEditor() {
          const [user, setUser] = useState({ name: "John", age: 25 });
          // ❌ Spreading state directly. Stale state risk.
          const updateAge = () => setUser({ ...user, age: 30 });
          //                                ^^^ Do not reference 'setUser' directly; use the updater function form instead.
          return <button onClick={updateAge}>Update Age</button>;
        }
      `,
      errors: [{ messageId: 'default' }]
    },
    {
      code: dedent`
        import { useState } from "react";
        function ItemList() {
          const [items, setItems] = useState(["a", "b"]);
          // ❌ Calling a method on state directly. Stale state risk.
          const addItem = () => setItems([...items, "c"]);
          //                              ^^^ Do not reference 'setItems' directly; use the updater function form instead.
          return <button onClick={addItem}>Add</button>;
        }
      `,
      errors: [{ messageId: 'default' }]
    }
  ],
  valid: [
    dedent`
      import { useState } from "react";
      function Counter() {
        const [count, setCount] = useState(0);
        // ✅ Callback form. Always gets the latest state.
        return (
          <button onClick={() => setCount((prev) => prev + 1)}>
            {count}
          </button>
        );
      }
    `,
    dedent`
      import { useState } from "react";
      function Component() {
        const [count, setCount] = useState(0);
        // ✅ Setting a constant value does not reference state.
        return <button onClick={() => setCount(0)}>Reset</button>;
      }
    `,
    dedent`
      import { useState } from "react";
      function Component() {
        const [user, setUser] = useState({ name: "John" });
        const newUserFromApi = { name: "Jane" };
        // ✅ Setting a value that does not reference the state variable.
        setUser(newUserFromApi);
        return <div />;
      }
    `,
    dedent`
          import { useState } from "react";
      function Component() {
        const [count, setCount] = useState(0);
        const [total, setTotal] = useState(100);
        // ✅ Referencing a *different* state variable is fine.
        setCount(total);
        return <div />;
      }
    `
  ]
}, {}, false);
