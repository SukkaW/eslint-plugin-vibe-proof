import { createRule } from '@/utils/create-eslint-rule';
import { isComponentName, isComponentOrHookName, isWrapperComponentCall } from '@/utils/react-hooks';
import type { FunctionNode } from '@/utils/react-hooks';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import { ASTUtils } from '@typescript-eslint/utils';

function getCalleeName(callExpr: TSESTree.CallExpression): string | null {
  const { callee } = callExpr;
  if (callee.type === AST_NODE_TYPES.Identifier) return callee.name;
  if (
    callee.type === AST_NODE_TYPES.MemberExpression
    && callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return callee.property.name;
  }
  return null;
}

const FLAGGED_HOOKS = new Set(['useMemo']);

function isComponentOrHookFunction(node: FunctionNode): boolean {
  if (node.type === AST_NODE_TYPES.FunctionDeclaration && node.id != null) {
    return isComponentOrHookName(node.id.name);
  }

  const parent = node.parent;

  if (parent.type === AST_NODE_TYPES.VariableDeclarator && parent.id.type === AST_NODE_TYPES.Identifier) {
    return isComponentOrHookName(parent.id.name);
  }

  // memo(() => ...) or forwardRef(() => ...)
  if (
    parent.type === AST_NODE_TYPES.CallExpression
    && parent.arguments[0] === node
    && isWrapperComponentCall(parent)
  ) {
    const grandparent = parent.parent;
    if (grandparent.type === AST_NODE_TYPES.VariableDeclarator && grandparent.id.type === AST_NODE_TYPES.Identifier) {
      return isComponentName(grandparent.id.name);
    }
  }

  return false;
}

type Context = 'render' | 'useMemo';

function getFlaggedContext(node: TSESTree.Node): Context | null {
  let current: TSESTree.Node | undefined = node.parent;
  while (current != null) {
    if (ASTUtils.isFunction(current)) {
      const parent = current.parent;

      if (
        parent.type === AST_NODE_TYPES.CallExpression
        && parent.arguments[0] === current
      ) {
        const hookName = getCalleeName(parent);
        if (hookName != null && FLAGGED_HOOKS.has(hookName)) {
          return hookName as Context;
        }
      }

      if (isComponentOrHookFunction(current)) {
        return 'render';
      }

      return null;
    }
    current = current.parent;
  }
  return null;
}

export default createRule({
  name: 'react-no-performance-impacting-array-find',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow `Array.prototype.find` in React render phase, useMemo, or useCallback. Maintain a Map for O(1) lookup instead.'
    },
    messages: {
      render: '`Array.prototype.find` is O(n) and should be avoided in the render phase. Maintain a Map or object for O(1) lookup when possible.',
      useMemo: '`Array.prototype.find` is O(n) and should be avoided in the useMemo. Even though useMemo cache the expensive computation, once dependencies change, it will still recompute. Maintain a Map or object for O(1) lookup instead.'
    },
    schema: []
  },
  create(context) {
    return {
      'CallExpression[callee.type="MemberExpression"][callee.property.name="find"]': (node: TSESTree.CallExpression) => {
        if (node.arguments.length === 0) return;

        const ctx = getFlaggedContext(node);
        if (ctx == null) return;

        const callee = node.callee as TSESTree.MemberExpression;
        context.report({ node: callee.property, messageId: ctx });
      }
    };
  }
});
