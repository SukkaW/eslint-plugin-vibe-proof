import { dedent } from 'ts-dedent';
import mod from '.';
import { runTest } from '@test/run-test';

runTest({
  module: mod,
  invalid: [
    // The canonical case from the guidance: awaited flag, cheap check after.
    {
      code: dedent`
        async function main(someCondition) {
          const someFlag = await getFlag();
          if (someFlag && someCondition) {
            doWork();
          }
        }
      `,
      errors: [{ messageId: 'eagerAwaitedFlag' }]
    },
    // Inline await followed by a cheap operand — swappable.
    {
      code: 'async function f(cond) { if (await getFlag() && cond) { work(); } }',
      output: 'async function f(cond) { if (cond && await getFlag()) { work(); } }',
      errors: [{ messageId: 'eagerAwaitInCondition' }]
    },
    // `||` short-circuits too.
    {
      code: 'async function f(cond) { if (await getFlag() || cond) { work(); } }',
      output: 'async function f(cond) { if (cond || await getFlag()) { work(); } }',
      errors: [{ messageId: 'eagerAwaitInCondition' }]
    },
    // Cheap operand is a negation / typeof / comparison on a local.
    {
      code: 'async function f(x) { if (await getFlag() && !x) { work(); } }',
      output: 'async function f(x) { if (!x && await getFlag()) { work(); } }',
      errors: [{ messageId: 'eagerAwaitInCondition' }]
    },
    {
      code: 'async function f(x) { if (await getFlag() && typeof x === "string") { work(); } }',
      output: 'async function f(x) { if (typeof x === "string" && await getFlag()) { work(); } }',
      errors: [{ messageId: 'eagerAwaitInCondition' }]
    },
    // Await nested inside a bigger operand expression still blocks the cheap check.
    {
      code: 'async function f(cond) { if ((await getUser()).isAdmin && cond) { work(); } }',
      output: 'async function f(cond) { if (cond && (await getUser()).isAdmin) { work(); } }',
      errors: [{ messageId: 'eagerAwaitInCondition' }]
    },
    {
      code: 'async function f(x) { if (await getFlag() && x == 1) { work(); } }',
      output: 'async function f(x) { if (x == 1 && await getFlag()) { work(); } }',
      errors: [{ messageId: 'eagerAwaitInCondition' }]
    },
    // Works outside an `if` too — any logical chain.
    // A pure operand may be hoisted past an impure one: moving `cond` performs
    // no work and observes nothing, and `other()` keeps its order with the rest.
    {
      code: 'async function f(cond) { if (await getFlag() && other() && cond) { work(); } }',
      output: 'async function f(cond) { if (cond && await getFlag() && other()) { work(); } }',
      errors: [{ messageId: 'eagerAwaitInCondition' }]
    },
    // The earliest cheap operand is hoisted first; repeated passes converge on
    // every cheap operand sitting ahead of the await.
    {
      code: 'async function f(a, b) { if (await getFlag() && a && b) { work(); } }',
      output: [
        'async function f(a, b) { if (a && await getFlag() && b) { work(); } }',
        'async function f(a, b) { if (a && b && await getFlag()) { work(); } }'
      ],
      errors: [{ messageId: 'eagerAwaitInCondition' }]
    },
    // A nested lower-precedence chain keeps its parentheses when it moves.
    {
      code: 'async function f(a, b, c) { if (await getFlag() && (a || b) && c) { work(); } }',
      output: [
        'async function f(a, b, c) { if ((a || b) && await getFlag() && c) { work(); } }',
        'async function f(a, b, c) { if ((a || b) && c && await getFlag()) { work(); } }'
      ],
      errors: [{ messageId: 'eagerAwaitInCondition' }]
    },
    // An operand that binds looser than `&&` keeps its parentheses when moved,
    // otherwise the chain would re-associate around it and change meaning.
    {
      code: 'async function f(a, b, c) { if (await getFlag() && (a ? b : c)) { work(); } }',
      output: 'async function f(a, b, c) { if ((a ? b : c) && await getFlag()) { work(); } }',
      errors: [{ messageId: 'eagerAwaitInCondition' }]
    },
    {
      code: 'async function f(a, b) { if (await getFlag() && (a ?? b)) { work(); } }',
      output: 'async function f(a, b) { if ((a ?? b) && await getFlag()) { work(); } }',
      errors: [{ messageId: 'eagerAwaitInCondition' }]
    },
    {
      code: 'async function f() { if (await getFlag() && (() => 1)) { work(); } }',
      output: 'async function f() { if ((() => 1) && await getFlag()) { work(); } }',
      errors: [{ messageId: 'eagerAwaitInCondition' }]
    },
    // Mixed operators: the `||` chain is the outer one here.
    {
      code: 'async function f(a) { if (await getFlag() || a) { work(); } }',
      output: 'async function f(a) { if (a || await getFlag()) { work(); } }',
      errors: [{ messageId: 'eagerAwaitInCondition' }]
    },
    {
      code: 'async function f(cond) { const ok = await getFlag() && cond; return ok; }',
      output: 'async function f(cond) { const ok = cond && await getFlag(); return ok; }',
      errors: [{ messageId: 'eagerAwaitInCondition' }]
    },
    // Flag read only inside the branch is still fine to defer.
    {
      code: dedent`
        async function main(someCondition) {
          const flag = await getFlag();
          if (flag && someCondition) {
            use(flag);
          }
        }
      `,
      errors: [{ messageId: 'eagerAwaitedFlag' }]
    },
    // let is movable as well as const.
    {
      code: dedent`
        async function main(cond) {
          let flag = await getFlag();
          if (flag && cond) {
            work();
          }
        }
      `,
      errors: [{ messageId: 'eagerAwaitedFlag' }]
    },
    // --- typed linting: a provably plain data property is a cheap read ---
    // Without type information this stays suppressed (see the valid cases);
    // with it, `user.id` is known to be a field rather than an accessor.
    {
      code: dedent`
        interface User { id: number }
        declare function getFlag(): Promise<boolean>;
        declare function work(): void;
        async function f(user: User) {
          if (await getFlag() && user.id === 3) { work(); }
        }
      `,
      output: dedent`
        interface User { id: number }
        declare function getFlag(): Promise<boolean>;
        declare function work(): void;
        async function f(user: User) {
          if (user.id === 3 && await getFlag()) { work(); }
        }
      `,
      errors: [{ messageId: 'eagerAwaitInCondition' }]
    },
    // A nested field chain is still just field reads.
    {
      code: dedent`
        interface Profile { active: boolean }
        interface User { profile: Profile }
        declare function getFlag(): Promise<boolean>;
        declare function work(): void;
        async function f(user: User) {
          if (await getFlag() && user.profile.active) { work(); }
        }
      `,
      output: dedent`
        interface Profile { active: boolean }
        interface User { profile: Profile }
        declare function getFlag(): Promise<boolean>;
        declare function work(): void;
        async function f(user: User) {
          if (user.profile.active && await getFlag()) { work(); }
        }
      `,
      errors: [{ messageId: 'eagerAwaitInCondition' }]
    },
    // The bound-flag form widens the same way.
    {
      code: dedent`
        interface User { id: number }
        declare function getFlag(): Promise<boolean>;
        declare function work(): void;
        async function f(user: User) {
          const flag = await getFlag();
          if (flag && user.id === 3) { work(); }
        }
      `,
      errors: [{ messageId: 'eagerAwaitedFlag' }]
    },
    // Several cheap operands after the flag.
    {
      code: dedent`
        async function main(a, b) {
          const flag = await getFlag();
          if (flag && a && b) {
            work();
          }
        }
      `,
      errors: [{ messageId: 'eagerAwaitedFlag' }]
    }
  ],
  valid: [
    // Already optimal: cheap check first.
    'async function f(cond) { if (cond && await getFlag()) { work(); } }',
    'async function f(cond) { if (cond) { if (await getFlag()) { work(); } } }',
    // Await is the only operand — nothing to short-circuit it.
    'async function f() { if (await getFlag()) { work(); } }',
    // Await is last in the chain — already correctly ordered.
    'async function f(a, b) { if (a && b && await getFlag()) { work(); } }',
    // H: the later operand is NOT cheap (a call may be expensive / impure).
    'async function f() { if (await getFlag() && expensive()) { work(); } }',
    // A member read on an untyped value could hit a getter that does real work
    // — never hoisted ahead of the await, even in a comparison.
    'async function f(o) { if (await getFlag() && o.maybeGetter) { work(); } }',
    'async function f(user) { if (await getFlag() && user.id === 3) { work(); } }',
    // --- typed linting: an accessor stays suppressed even with type info ---
    dedent`
      class Box {
        get expensive(): boolean { return computeHard(); }
      }
      declare function computeHard(): boolean;
      declare function getFlag(): Promise<boolean>;
      declare function work(): void;
      async function f(box: Box) {
        if (await getFlag() && box.expensive) { work(); }
      }
    `,
    // An accessor anywhere in the chain of reads is enough to suppress.
    dedent`
      class Inner { get hot(): boolean { return true; } }
      declare const outer: { inner: Inner };
      declare function getFlag(): Promise<boolean>;
      declare function work(): void;
      async function f() {
        if (await getFlag() && outer.inner.hot) { work(); }
      }
    `,
    // Computed access cannot be proven — the key is not statically known.
    dedent`
      interface Bag { [key: string]: boolean }
      declare function getFlag(): Promise<boolean>;
      declare function work(): void;
      async function f(bag: Bag, key: string) {
        if (await getFlag() && bag[key]) { work(); }
      }
    `,
    // Two awaits: reordering them is a different question, not this rule's.
    'async function f() { if (await getA() && await getB()) { work(); } }',
    // Assignment / update in the later operand is a side effect.
    'async function f(x) { if (await getFlag() && (x = 1)) { work(); } }',
    'async function f(x) { if (await getFlag() && x++) { work(); } }',
    // An await inside a nested function body does not run while evaluating the operand.
    'async function f(cond) { if (makeTask(async () => await getFlag()) && cond) { work(); } }',
    // H1/H8: the cheap operand depends on the flag itself.
    dedent`
      async function main() {
        const flag = await getFlag();
        if (flag && flag.enabled) {
          work();
        }
      }
    `,
    // H: flag is read after the if — moving the await would take it out of scope.
    dedent`
      async function main(cond) {
        const flag = await getFlag();
        if (flag && cond) {
          work();
        }
        report(flag);
      }
    `,
    // H: flag is read in the else branch.
    dedent`
      async function main(cond) {
        const flag = await getFlag();
        if (flag && cond) {
          work();
        } else {
          report(flag);
        }
      }
    `,
    // H2: an intervening statement would be reordered relative to the await.
    dedent`
      async function main(cond) {
        const flag = await getFlag();
        log('checking');
        if (flag && cond) {
          work();
        }
      }
    `,
    // The declaration is not immediately before the if.
    dedent`
      async function main(cond) {
        const flag = await getFlag();
        const other = compute();
        if (flag && cond) {
          work();
        }
      }
    `,
    // H6: `using` ties disposal to scope — never move it.
    dedent`
      async function main(cond) {
        await using handle = await open();
        if (handle && cond) {
          work();
        }
      }
    `,
    // Multiple declarators: splitting the statement is out of scope.
    dedent`
      async function main(cond) {
        const flag = await getFlag(), other = 1;
        if (flag && other && cond) {
          work();
        }
      }
    `,
    // Destructured binding — the awaited value spreads across names.
    dedent`
      async function main(cond) {
        const { flag } = await getFlags();
        if (flag && cond) {
          work();
        }
      }
    `,
    // The init is not a bare await.
    dedent`
      async function main(cond) {
        const flag = (await getFlag()) ?? fallback();
        if (flag && cond) {
          work();
        }
      }
    `,
    // A plain sync flag has no await to defer.
    dedent`
      async function main(cond) {
        const flag = getFlag();
        if (flag && cond) {
          work();
        }
      }
    `,
    // A cheap operand before a non-await expensive call is untouched.
    'function f(a, b) { if (a && b) { work(); } }'
  ]
});
