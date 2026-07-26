import { createRule } from '@/utils/create-eslint-rule';
import { getImportedName, isFoxactImport, isGlobalReference, unwrapExpression } from '@/utils/ast';
import { isComponentOrHookFunction, isHookCall } from '@/utils/react-hooks';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import { ASTUtils } from '@typescript-eslint/utils';
import type { TSESLint } from '@typescript-eslint/utils';

// The rule targets storage read *into render* — the case `foxact/use-local-storage`
// solves by subscribing via `useSyncExternalStore` so the component re-renders on
// change. Storage touched from a nested callback (event handler, `asyncValues`
// one-shot initializer, effect, `.then`, ...) does not feed render and needs no
// subscription, so it is allowed.
//
// Returns true when the nearest enclosing function of `node` is the
// component/hook render body itself (no intervening callback).
function isInRenderPath(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined = node.parent;
  while (current != null) {
    if (ASTUtils.isFunction(current)) {
      return isComponentOrHookFunction(current);
    }
    current = current.parent;
  }
  // Module-level (not inside any function) — treated as render-path/eager.
  return true;
}

// A dependency array is the array-literal 2nd argument of a hook call:
// `useEffect(fn, [deps])`, `useMemo(fn, [deps])`, `useCallback(fn, [deps])`, …
function isDependencyArray(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.ArrayExpression
    && node.parent.type === AST_NODE_TYPES.CallExpression
    && node.parent.arguments[1] === node
    && isHookCall(node.parent);
}

// Whether `node` sits lexically inside a dependency array.
function isInsideDependencyArray(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined = node;
  while (current != null) {
    if (isDependencyArray(current)) return true;
    current = current.parent;
  }
  return false;
}

function getStorageKind(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Expression
): 'local' | 'session' | null {
  const expression = unwrapExpression(node);

  if (expression.type === AST_NODE_TYPES.Identifier && isGlobalReference(sourceCode, expression)) {
    if (expression.name === 'localStorage') return 'local';
    if (expression.name === 'sessionStorage') return 'session';
    return null;
  }

  if (
    expression.type !== AST_NODE_TYPES.MemberExpression
    || expression.computed
    || expression.property.type !== AST_NODE_TYPES.Identifier
  ) {
    return null;
  }

  const propertyName = expression.property.name;
  if (propertyName !== 'localStorage' && propertyName !== 'sessionStorage') return null;

  const object = unwrapExpression(expression.object);

  if (object.type === AST_NODE_TYPES.Identifier && isGlobalReference(sourceCode, object) && (object.name === 'window' || object.name === 'globalThis' || object.name === 'self')) {
    return propertyName === 'localStorage' ? 'local' : 'session';
  }

  return null;
}

export default createRule({
  name: 'react-prefer-foxact-persistent',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow localStorage and sessionStorage in React code.'
    },
    messages: {
      local: 'Do not use `localStorage` in React code. Use `foxact/use-local-storage` or `foxact/create-local-storage-state` instead.',
      session: 'Do not use `sessionStorage` in React code. Use `foxact/use-session-storage` or `foxact/create-session-storage-state` instead.',
      returnLocalStorage: 'Do not return `useLocalStorage()` directly. If you want to share the storage across multiple components, use `foxact/create-local-storage-state` instead.',
      returnSessionStorage: 'Do not return `useSessionStorage()` directly. If you want to share the storage across multiple components, use `foxact/create-session-storage-state` instead.'
    },
    schema: []
  },
  create(context) {
    const { sourceCode } = context;

    // A storage read that `isInRenderPath` would exempt is still a subscription
    // bug when its value is wired into a dependency array: deps only re-compare
    // on an unrelated re-render, so storage changes never propagate. Flag when
    // the read is directly in a dep array, or (one hop) the render-body binding
    // it initializes is referenced from a dep array.
    function flowsIntoDependencyArray(node: TSESTree.Node): boolean {
      if (isInsideDependencyArray(node)) return true;

      // Climb to the render-body `const X = <...node...>` binding (crossing at
      // most the one callback the read lives in), then see whether X is
      // referenced inside a dependency array. Stop at the component/hook body.
      let current: TSESTree.Node | undefined = node;
      while (current != null) {
        if (ASTUtils.isFunction(current) && isComponentOrHookFunction(current)) break;

        const parent: TSESTree.Node | undefined = current.parent;
        if (
          parent?.type === AST_NODE_TYPES.VariableDeclarator
          && parent.init === current
          && parent.id.type === AST_NODE_TYPES.Identifier
        ) {
          const variable = ASTUtils.findVariable(sourceCode.getScope(parent.id), parent.id.name);
          return variable?.references.some((ref) => isInsideDependencyArray(ref.identifier)) ?? false;
        }
        current = parent;
      }
      return false;
    }

    function checkReturnedStorageHook(reportNode: TSESTree.Node, expression: TSESTree.Expression) {
      const arg = unwrapExpression(expression);
      if (arg.type !== AST_NODE_TYPES.CallExpression) return;

      const callee = arg.callee;
      if (callee.type !== AST_NODE_TYPES.Identifier) return;

      // Only foxact's own hook has a `foxact/create-*-storage-state`
      // counterpart to migrate to. A same-named hook from another library
      // (`react-use`, `usehooks-ts`, …) is a different API, and an unresolved
      // one cannot be shown to be foxact's, so neither is reported.
      if (!isFoxactImport(sourceCode, callee)) return;

      // Match the exported name so `import { useLocalStorage as useStored }`
      // is still recognised.
      const hookName = getImportedName(sourceCode, callee);
      if (hookName !== 'useLocalStorage' && hookName !== 'useSessionStorage') return;

      context.report({
        node: reportNode,
        messageId: hookName === 'useLocalStorage' ? 'returnLocalStorage' : 'returnSessionStorage'
      });
    }

    return {
      MemberExpression(node) {
        const kind = getStorageKind(sourceCode, node);
        if (kind == null) return;

        if (
          node.parent.type === AST_NODE_TYPES.MemberExpression
          && node.parent.object === node
          && getStorageKind(sourceCode, node.parent) != null
        ) {
          return;
        }

        // Only storage read into render needs the subscribing hook — unless
        // its value is wired into a dependency array, which likewise expects
        // storage changes to propagate.
        if (!isInRenderPath(node) && !flowsIntoDependencyArray(node)) return;

        context.report({ node, messageId: kind });
      },
      ReturnStatement(node) {
        if (node.argument == null) return;
        checkReturnedStorageHook(node, node.argument);
      },
      ArrowFunctionExpression(node) {
        if (node.body.type === AST_NODE_TYPES.BlockStatement) return;
        checkReturnedStorageHook(node, node.body);
      },
      Identifier(node) {
        if (node.name !== 'localStorage' && node.name !== 'sessionStorage') return;
        if (!isGlobalReference(sourceCode, node)) return;

        // Skip property access position (e.g. window.localStorage — handled by MemberExpression)
        if (
          node.parent.type === AST_NODE_TYPES.MemberExpression
          && node.parent.property === node
          && !node.parent.computed
        ) {
          return;
        }

        // Skip when parent MemberExpression is already a storage access (avoid double report with MemberExpression handler)
        if (
          node.parent.type === AST_NODE_TYPES.MemberExpression
          && node.parent.object === node
          && getStorageKind(sourceCode, node.parent) != null
        ) {
          return;
        }

        // Only storage read into render needs the subscribing hook — unless
        // its value is wired into a dependency array.
        if (!isInRenderPath(node) && !flowsIntoDependencyArray(node)) return;

        const kind = node.name === 'localStorage' ? 'local' as const : 'session' as const;
        context.report({ node, messageId: kind });
      }
    };
  }
});
