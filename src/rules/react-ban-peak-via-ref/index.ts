import { createRule } from '@/utils/create-eslint-rule';
import { unwrapExpression, walkNodes } from '@/utils/ast';
import {
  isHookCall,
  getHookCalleeName,
  isUseStateLikeCall,
  isUseEffectCall,
  isComponentOrHookFunction
} from '@/utils/react-hooks';
import type { FunctionNode } from '@/utils/react-hooks';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import { TSESLint, ASTUtils } from '@typescript-eslint/utils';

const RE_USE_REF = /^use\w*Ref$/;

// Walks `props.a.b[0]` (through TS casts/chains) down to the root identifier.
function getRootIdentifier(node: TSESTree.Expression): TSESTree.Identifier | null {
  let current = node;
  while (true) {
    current = unwrapExpression(current);
    if (current.type === AST_NODE_TYPES.MemberExpression) {
      current = current.object;
      continue;
    }
    break;
  }
  return current.type === AST_NODE_TYPES.Identifier ? current : null;
}

// Whether `fn` is the callback of a `use*Effect(...)` call.
function isEffectCallback(fn: FunctionNode): boolean {
  const parent = fn.parent;
  return parent.type === AST_NODE_TYPES.CallExpression
    && parent.arguments[0] === fn
    && isUseEffectCall(parent);
}

// Whether `node` runs inside a callback that is neither the component/hook
// render body nor an effect — an event handler, `useCallback` body,
// subscription callback, etc. Writing a reactive snapshot into a ref from there
// is deliberate imperative capture, not a render/effect-time peek.
function isInsideNonEffectCallback(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined = node.parent;
  while (current != null) {
    if (ASTUtils.isFunction(current)) {
      // Reached the component/hook body without crossing a plain callback —
      // the write is in render phase (still the anti-pattern).
      if (isComponentOrHookFunction(current)) return false;
      // An effect callback is still flagged; any other function is a handler.
      if (!isEffectCallback(current)) return true;
    }
    current = current.parent;
  }
  return false;
}

export default createRule({
  name: 'react-ban-peak-via-ref',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow mirroring props, state, or hook returns into a ref (`someRef.current = value`) so the value can be peeked at later. Reactive values should be read where they are reactive.'
    },
    messages: {
      default: 'Do not sync {{kind}} into a ref to peek at its value later. Use the proper pattern instead: '
        + '(1) An event handler subscribed inside `useEffect` that must stay stable while accessing the latest state/props — use `useEffectEvent` from React 19.2. '
        + '(2) An event handler passed to JSX that must stay stable while accessing the latest state/props — use `useStableHandler` from `foxact/use-stable-handler-only-when-you-know-what-you-are-doing-or-you-will-be-fired`. '
        + '(3) Peeking props to produce state updates — use `useReducer` and declare the reducer inline within the component body: the inlined reducer accesses the current props snapshot during the render phase to produce props-derived state, while the dispatcher remains stable. '
        + '(4) Peeking the "latest" state or hook return value — just don\'t, this must be wrong and there must be a better way. '
    },
    schema: []
  },
  create(context) {
    function resolveVariable(id: TSESTree.Identifier): TSESLint.Scope.Variable | null {
      return ASTUtils.findVariable(context.sourceCode.getScope(id), id.name);
    }

    // `<id>.current` where <id> resolves to a `useXxxRef()` binding
    function isRefCurrentTarget(left: TSESTree.Node): boolean {
      if (
        left.type !== AST_NODE_TYPES.MemberExpression
        || left.computed
        || left.property.type !== AST_NODE_TYPES.Identifier
        || left.property.name !== 'current'
        || left.object.type !== AST_NODE_TYPES.Identifier
      ) {
        return false;
      }

      const def = resolveVariable(left.object)?.defs.at(0);
      if (def?.type !== TSESLint.Scope.DefinitionType.Variable) return false;
      if (def.node.init == null) return false;

      const init = unwrapExpression(def.node.init);
      if (!isHookCall(init)) return false;
      const hookName = getHookCalleeName(init);
      return hookName != null && RE_USE_REF.test(hookName);
    }

    // What kind of reactive value the expression is (or derives from), if any.
    // Follows fallbacks, ternaries, computations, literals wrapping, and
    // derived local consts. Call expressions are deliberately NOT followed:
    // a call's return value (e.g. a `setTimeout` timer id) is not reactive
    // data even when reactive values appear in its arguments.
    function classifyExpression(node: TSESTree.Expression, visited: Set<TSESLint.Scope.Variable>): string | null {
      let current = node;
      while (true) {
        const expr = unwrapExpression(current);

        switch (expr.type) {
          // value ?? fallback / cond ? a : b — the value keeps its identity
          case AST_NODE_TYPES.LogicalExpression:
            return classifyExpression(expr.left, visited) ?? classifyExpression(expr.right, visited);
          case AST_NODE_TYPES.ConditionalExpression:
            return classifyExpression(expr.consequent, visited) ?? classifyExpression(expr.alternate, visited);

          // Computations derived from reactive values are still reactive snapshots
          case AST_NODE_TYPES.BinaryExpression:
            return (expr.left.type === AST_NODE_TYPES.PrivateIdentifier ? null : classifyExpression(expr.left, visited))
              ?? classifyExpression(expr.right, visited);
          case AST_NODE_TYPES.UnaryExpression:
            current = expr.argument;
            continue;
          case AST_NODE_TYPES.TemplateLiteral: {
            for (const sub of expr.expressions) {
              const kind = classifyExpression(sub, visited);
              if (kind != null) return kind;
            }
            return null;
          }

          // Wrapping in a fresh literal is still mirroring the value
          case AST_NODE_TYPES.ArrayExpression: {
            for (const element of expr.elements) {
              if (element == null) continue;
              const kind = classifyExpression(
                element.type === AST_NODE_TYPES.SpreadElement ? element.argument : element,
                visited
              );
              if (kind != null) return kind;
            }
            return null;
          }
          case AST_NODE_TYPES.ObjectExpression: {
            for (const property of expr.properties) {
              if (property.type === AST_NODE_TYPES.SpreadElement) {
                const kind = classifyExpression(property.argument, visited);
                if (kind != null) return kind;
                continue;
              }
              if (property.value.type === AST_NODE_TYPES.AssignmentPattern || property.value.type === AST_NODE_TYPES.TSEmptyBodyFunctionExpression) continue;
              const kind = classifyExpression(property.value, visited);
              if (kind != null) return kind;
            }
            return null;
          }

          default: {
            const root = getRootIdentifier(expr);
            if (root == null) return null;
            return classifyReactiveValue(root, visited);
          }
        }
      }
    }

    // What kind of reactive value the identifier resolves to, if any
    function classifyReactiveValue(id: TSESTree.Identifier, visited: Set<TSESLint.Scope.Variable>): string | null {
      const variable = resolveVariable(id);
      if (variable == null || visited.has(variable)) return null;
      visited.add(variable);

      const def = variable.defs.at(0);
      if (def == null) return null;

      // Component props / custom hook arguments
      if (def.type === TSESLint.Scope.DefinitionType.Parameter) {
        const fn = def.node;
        if (!ASTUtils.isFunction(fn)) return null;
        return isComponentOrHookFunction(fn) ? 'props' : null;
      }

      if (def.type !== TSESLint.Scope.DefinitionType.Variable) return null;
      const declarator = def.node;
      if (declarator.init == null) return null;

      const init = unwrapExpression(declarator.init);

      // Derived local (const orgId = org?.id ?? null) — classify what it derives from
      if (!isHookCall(init)) return classifyExpression(init, visited);

      // A ref itself is a stable container, not a reactive value
      const hookName = getHookCalleeName(init);
      if (hookName != null && RE_USE_REF.test(hookName)) return null;

      // Setters are NOT exempt: a stable setter never needs a ref, and an
      // unstable one is a changing hook return being peeked — wrong either way
      return isUseStateLikeCall(init) ? 'state' : 'a hook return value';
    }

    // A change-detection guard: the ref stores the "last handled" value to fire
    // once per change, not to peek a stale value later — a legitimate pattern.
    // Two shapes, both keyed on a condition that reads the SAME `<ref>.current`:
    //   if (calledRef.current !== x) { calledRef.current = x; ... }     // enclosing if
    //   if (calledRef.current === x) return; calledRef.current = x;     // early return
    function isChangeDetectionGuard(assignment: TSESTree.AssignmentExpression): boolean {
      const target = assignment.left;
      if (
        target.type !== AST_NODE_TYPES.MemberExpression
        || target.object.type !== AST_NODE_TYPES.Identifier
      ) {
        return false;
      }
      const refName = target.object.name;

      let current: TSESTree.Node = assignment;
      while (current.parent != null) {
        const parent: TSESTree.Node = current.parent;

        // Enclosing `if (ref.current ...) { ...assignment... }`
        if (
          parent.type === AST_NODE_TYPES.IfStatement
          && (parent.consequent === current || parent.alternate === current)
          && conditionReadsRefCurrent(parent.test, refName)
        ) {
          return true;
        }

        // Preceding `if (ref.current ...) return;` in the same block
        if (parent.type === AST_NODE_TYPES.BlockStatement) {
          for (const stmt of parent.body) {
            if (stmt.range[1] > current.range[0]) break;
            if (isEarlyReturnGuard(stmt, refName)) return true;
          }
        }

        current = parent;
      }
      return false;
    }

    // `if (<reads ref.current>) return;`
    function isEarlyReturnGuard(stmt: TSESTree.Statement, refName: string): boolean {
      if (stmt.type !== AST_NODE_TYPES.IfStatement) return false;
      if (!conditionReadsRefCurrent(stmt.test, refName)) return false;

      const body = stmt.consequent;
      if (body.type === AST_NODE_TYPES.ReturnStatement) return true;
      if (body.type === AST_NODE_TYPES.BlockStatement) {
        return body.body.some((s) => s.type === AST_NODE_TYPES.ReturnStatement);
      }
      return false;
    }

    function conditionReadsRefCurrent(test: TSESTree.Expression, refName: string): boolean {
      let found = false;
      walkNodes(test, context.sourceCode.visitorKeys, (n) => {
        if (found) return false;
        if (
          n.type === AST_NODE_TYPES.MemberExpression
          && !n.computed
          && n.property.type === AST_NODE_TYPES.Identifier
          && n.property.name === 'current'
          && n.object.type === AST_NODE_TYPES.Identifier
          && n.object.name === refName
        ) {
          found = true;
          return false;
        }
      });
      return found;
    }

    return {
      AssignmentExpression(node) {
        if (node.operator !== '=') return;
        if (!isRefCurrentTarget(node.left)) return;

        const kind = classifyExpression(node.right, new Set());
        if (kind == null) return;

        // "Last-seen" change-detection guard — legitimate, not a stale peek
        if (isChangeDetectionGuard(node)) return;

        // Imperative capture inside an event handler / callback — legitimate
        if (isInsideNonEffectCallback(node)) return;

        context.report({ node, messageId: 'default', data: { kind } });
      }
    };
  }
});
