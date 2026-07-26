import { dedent } from 'ts-dedent';
import mod from '.';
import { runTest } from '@test/run-test';

runTest({
  module: mod,
  invalid: [
    {
      code: dedent`
        import { useEffect, useState } from "react";
        function CircularEffect1() {
          const [items, setItems] = useState([0, 1, 2, 3, 4]);
          useEffect(() => {
            setItems(x => [...x].reverse());
          }, [items]);
          // ^^^ Circular effect detected: this effect depends on [items] and updates [items], creating an infinite update loop.
          return null;
        }
      `,
      errors: [{ messageId: 'circularEffect' }]
    },
    {
      code: dedent`
        import { useEffect, useState } from "react";
        function CircularEffect2() {
          const [items, setItems] = useState([0, 1, 2, 3, 4]);
          const [limit, setLimit] = useState(false);
          useEffect(() => {
            setItems(x => [...x].reverse());
          }, [limit]);
          // ^^^ Circular effect detected: this effect depends on [limit] and updates [items], creating an infinite update loop.
          useEffect(() => {
            setLimit(x => !x);
          }, [items]);
          // ^^^ Circular effect detected: this effect depends on [items] and updates [limit], creating an infinite update loop.
          return null;
        }
      `,
      errors: [{ messageId: 'circularEffect' }, { messageId: 'circularEffect' }]
    },
    {
      code: dedent`
        import { useEffect, useState } from "react";
        function CircularEffect3() {
          const [items, setItems] = useState([0, 1, 2, 3, 4]);
          const [limit, setLimit] = useState(false);
          const [count, setCount] = useState(0);
          useEffect(() => {
            setItems(x => [...x].reverse());
          }, [limit]);
          // ^^^ Circular effect detected: this effect depends on [limit] and updates [items], creating an infinite update loop.
          useEffect(() => {
            setCount(x => x + 1);
          }, [items]);
          // ^^^ Circular effect detected: this effect depends on [items] and updates [count], creating an infinite update loop.
          useEffect(() => {
            setLimit(x => !x);
          }, [count]);
          // ^^^ Circular effect detected: this effect depends on [count] and updates [limit], creating an infinite update loop.
          return null;
        }
      `,
      errors: [
        { messageId: 'circularEffect' },
        { messageId: 'circularEffect' },
        { messageId: 'circularEffect' }
      ]
    }
  ],
  valid: [
    dedent`
      import { useEffect, useState } from "react";
      function ValidComponent() {
        const [count, setCount] = useState(0);
        const [label, setLabel] = useState("");
        // ✅ Depends on count, sets label. No cycle.
        useEffect(() => {
          setLabel('Count is ' + count);
        }, [count]);
        return null;
      }
    `,
    dedent`
      import { useEffect, useState } from "react";
      function ValidComponent2() {
        const [count, setCount] = useState(0);
        // ✅ No dependency array. Not a circular pattern.
        useEffect(() => {
          setCount(0);
        });
        return null;
      }
    `,
    dedent`
      import { useEffect, useState } from "react";
      function ValidComponent3() {
        const [count, setCount] = useState(0);
        // This is a very simplified pattern, practically wrong
        // but it is only to demonstrate that the setState call is guarded
        // so there will be no infinite loop.
        useEffect(() => {
          if (count < 5) {
            setCount(x => x + 1);
          }
        }, [count]);
        return null;
      }
    `
  ]
}, {}, false);
