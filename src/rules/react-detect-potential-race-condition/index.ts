import { createRule } from '@/utils/create-eslint-rule';
import { walkNodes } from '@/utils/ast';
import {
  isUseEffectCall,
  isSetStateCallee,
  getEffectCallback,
  isRangeInside
} from '@/utils/react-hooks';
import type { EffectCallback } from '@/utils/react-hooks';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import { ASTUtils } from '@typescript-eslint/utils';
import type { TSESLint } from '@typescript-eslint/utils';

type VisitorKeys = TSESLint.SourceCode.VisitorKeys;

// Promise-continuation methods whose callback runs after the promise settles.
const PROMISE_CONTINUATION_METHODS = new Set(['then', 'catch', 'finally']);

// Well-known async-result option callbacks (React Query, SWR, Apollo, etc.).
// A `setState` inside one lands after the async work resolves, so it races.
const ASYNC_RESULT_CALLBACKS = new Set([
  'onSuccess', 'onError', 'onSettled', 'onCompleted', 'onData'
]);

const MESSAGE = 'Calling a state setter inside an async callback within an effect can cause a race condition: '
  + 'if the effect re-runs before the previous async work resolves, a stale response can overwrite a newer one. '
  + 'Guard the update against staleness. The preferred fix is `useEffect` from `foxact/use-abortable-effect`, '
  + 'which passes an `AbortSignal`: `useEffect((signal) => { work().then((data) => { if (signal.aborted) return; setData(data); }); }, [dep])`. '
  + 'Alternatively, use a cancellation flag cleared in the effect cleanup: '
  + '`let cancelled = false; work().then((data) => { if (!cancelled) setData(data); }); return () => { cancelled = true; };`.';

// Whether the function is a callback whose invocation is a recognized async
// continuation. Deliberately a whitelist — we would rather miss a case (to
// cover later) than raise false positives on arbitrary `foo(cb)` calls:
// - a `.then()`/`.catch()`/`.finally()` argument, or
// - the value of a known async-result option (`onSuccess`, `onError`, ...).
function isDeferredCallback(fn: TSESTree.Node): boolean {
  const parent = fn.parent;
  if (parent == null) return false;

  // .then(cb) / .catch(cb) / .finally(cb)
  if (
    parent.type === AST_NODE_TYPES.CallExpression
    && parent.arguments.includes(fn as TSESTree.CallExpressionArgument)
    && parent.callee.type === AST_NODE_TYPES.MemberExpression
    && parent.callee.property.type === AST_NODE_TYPES.Identifier
    && PROMISE_CONTINUATION_METHODS.has(parent.callee.property.name)
  ) {
    return true;
  }

  // { onSuccess: cb } / { onSuccess(cb) } passed as an options object argument
  if (
    parent.type === AST_NODE_TYPES.Property
    && parent.value === fn
    && !parent.computed
    && parent.key.type === AST_NODE_TYPES.Identifier
    && ASYNC_RESULT_CALLBACKS.has(parent.key.name)
    && parent.parent.type === AST_NODE_TYPES.ObjectExpression
    && parent.parent.parent.type === AST_NODE_TYPES.CallExpression
  ) {
    return true;
  }

  return false;
}

// Whether `node` executes in an async continuation relative to `effectCallback`:
// - inside a recognized deferred callback (`.then`/`.catch`/`.finally`, `onSuccess`, ...), or
// - after an `await` in the enclosing async function (within the effect).
function isInAsyncContext(
  node: TSESTree.Node,
  effectCallback: EffectCallback,
  visitorKeys: VisitorKeys
): boolean {
  let current: TSESTree.Node | undefined = node;

  while (current !== effectCallback && current != null) {
    if (ASTUtils.isFunction(current)) {
      // A callback whose invocation is deferred to external/async code
      if (isDeferredCallback(current)) return true;

      // An async function whose body runs an `await` before `node`
      if (current.async && functionHasAwaitBefore(current, node.range[0], visitorKeys)) return true;
    }

    current = current.parent;
  }

  return false;
}

// Whether an `await` (not nested in another function) executes textually
// before `offset` within `fn`.
function functionHasAwaitBefore(fn: TSESTree.Node, offset: number, visitorKeys: VisitorKeys): boolean {
  let found = false;
  walkNodes(fn, visitorKeys, (n) => {
    if (found) return false;
    if (n.type === AST_NODE_TYPES.AwaitExpression && n.range[1] <= offset) {
      found = true;
      return false;
    }
    // don't descend into nested functions — their awaits are their own timeline
    if (n !== fn && ASTUtils.isFunction(n)) return false;
  });
  return found;
}

export default createRule({
  name: 'react-detect-potential-race-condition',
  meta: {
    type: 'problem',
    docs: {
      description: 'Detect unguarded state updates after async work inside an effect, which can cause a race condition where a stale response overwrites a newer one.'
    },
    messages: {
      default: MESSAGE
    },
    schema: []
  },
  create(context) {
    const { visitorKeys } = context.sourceCode;

    return {
      CallExpression(node) {
        if (!isSetStateCallee(context.sourceCode, node.callee)) return;

        const effectCall = findEnclosingEffectCall(node);
        if (effectCall == null) return;

        const callback = getEffectCallback(effectCall);
        if (callback == null) return;

        // An effect callback that declares a parameter (e.g. `useEffect((signal)
        // => ...)` from `foxact/use-abortable-effect`) signals the developer is
        // using an abortable-effect variant and already handles cancellation.
        // A TypeScript function-type guard prevents this from being an escape
        // hatch on the plain `useEffect`, so skipping here is safe.
        if (callback.params.length > 0) return;

        // Only setState calls inside the effect callback matter
        if (!isRangeInside(node.range, callback.range)) return;

        if (!isInAsyncContext(node, callback, visitorKeys)) return;

        if (isStalenessGuarded(node, callback, visitorKeys)) return;

        context.report({ node, messageId: 'default' });
      }
    };
  }
});

function findEnclosingEffectCall(node: TSESTree.Node): TSESTree.CallExpression | null {
  let current: TSESTree.Node | undefined = node.parent;
  while (current != null) {
    if (current.type === AST_NODE_TYPES.CallExpression && isUseEffectCall(current)) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

// Whether `setStateCall` is protected by a staleness guard: a preceding
// early-return or an enclosing `if` that references either the abortable-effect
// signal (`signal.aborted`) or a cancellation flag from the effect scope.
function isStalenessGuarded(
  setStateCall: TSESTree.Node,
  callback: EffectCallback,
  visitorKeys: VisitorKeys
): boolean {
  const guardNames = collectGuardNames(callback, visitorKeys);
  if (guardNames.size === 0) return false;

  // Walk up from the setState call, looking for a guarding condition that
  // sits before it in the same continuation.
  let current: TSESTree.Node = setStateCall;
  while (current !== callback) {
    const parent = current.parent;
    if (parent == null) break;

    // Enclosing `if (guard-related) { ... setState ... }`
    if (
      parent.type === AST_NODE_TYPES.IfStatement
      && (parent.consequent === current || parent.alternate === current)
      && conditionReferencesGuard(parent.test, guardNames, visitorKeys)
    ) {
      return true;
    }

    // Preceding `if (guard) return;` inside the same block
    if (parent.type === AST_NODE_TYPES.BlockStatement) {
      for (const stmt of parent.body) {
        if (stmt.range[1] > current.range[0]) break;
        if (isEarlyReturnGuard(stmt, guardNames, visitorKeys)) return true;
      }
    }

    current = parent;
  }

  return false;
}

// Names that, when referenced in a condition, indicate a staleness check.
// (Effects with a parameter — the abortable-effect signal form — are skipped
// upstream, so only cancellation flags set in cleanup remain to detect here.)
function collectGuardNames(callback: EffectCallback, visitorKeys: VisitorKeys): Set<string> {
  const names = new Set<string>();

  // Cancellation flags: booleans mutated inside the effect's cleanup function
  if (callback.body.type === AST_NODE_TYPES.BlockStatement) {
    for (const stmt of callback.body.body) {
      if (stmt.type !== AST_NODE_TYPES.ReturnStatement || stmt.argument == null) continue;
      const cleanup = stmt.argument;
      if (!ASTUtils.isFunction(cleanup)) continue;
      walkNodes(cleanup, visitorKeys, (n) => {
        if (n.type === AST_NODE_TYPES.AssignmentExpression && n.left.type === AST_NODE_TYPES.Identifier) {
          names.add(n.left.name);
        }
      });
    }
  }

  return names;
}

function conditionReferencesGuard(test: TSESTree.Expression, guardNames: Set<string>, visitorKeys: VisitorKeys): boolean {
  let found = false;
  walkNodes(test, visitorKeys, (n) => {
    if (found) return false;
    if (n.type === AST_NODE_TYPES.Identifier && guardNames.has(n.name)) {
      found = true;
      return false;
    }
  });
  return found;
}

// `if (guard) return;` / `if (signal.aborted) return;`
function isEarlyReturnGuard(stmt: TSESTree.Statement, guardNames: Set<string>, visitorKeys: VisitorKeys): boolean {
  if (stmt.type !== AST_NODE_TYPES.IfStatement) return false;
  if (!conditionReferencesGuard(stmt.test, guardNames, visitorKeys)) return false;

  const body = stmt.consequent;
  if (body.type === AST_NODE_TYPES.ReturnStatement) return true;
  if (body.type === AST_NODE_TYPES.BlockStatement) {
    return body.body.some((s) => s.type === AST_NODE_TYPES.ReturnStatement);
  }
  return false;
}
