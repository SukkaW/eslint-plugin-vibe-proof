import { createRule } from '@/utils/create-eslint-rule';
import type { RuleContext } from '@/utils/create-eslint-rule';
import { getEffectCallback, isRangeInside, isUseEffectCall } from '@/utils/react-hooks';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import { findVariable } from '@typescript-eslint/utils/ast-utils';

const MESSAGE = 'Do not use a manual cancellation flag to prevent race conditions in `useEffect`. Use `useAbortableEffect` from `foxact/use-abortable-effect`, which hands the effect an `AbortSignal`: pass it to `fetch({ signal })` and guard with `if (signal.aborted) return;` instead.';
import type { EffectCallback } from '@/utils/react-hooks';

function getCleanupFunctions(callback: EffectCallback): EffectCallback[] {
  if (callback.body.type !== AST_NODE_TYPES.BlockStatement) return [];

  const cleanupFns: EffectCallback[] = [];
  for (let i = 0, len = callback.body.body.length; i < len; i++) {
    const statement = callback.body.body[i];
    if (statement.type !== AST_NODE_TYPES.ReturnStatement || statement.argument == null) continue;
    if (statement.argument.type === AST_NODE_TYPES.FunctionExpression || statement.argument.type === AST_NODE_TYPES.ArrowFunctionExpression) {
      cleanupFns.push(statement.argument);
    }
  }
  return cleanupFns;
}

function isConditionLikeReference(node: TSESTree.Identifier, boundary: EffectCallback) {
  let current: TSESTree.Node = node;
  let parent: TSESTree.Node | null = node.parent ?? null;

  while (parent !== boundary && parent != null) {
    if (
      (parent.type === AST_NODE_TYPES.IfStatement
        || parent.type === AST_NODE_TYPES.ConditionalExpression
        || parent.type === AST_NODE_TYPES.WhileStatement
        || parent.type === AST_NODE_TYPES.DoWhileStatement)
      && parent.test === current
    ) {
      return true;
    }

    if (parent.type === AST_NODE_TYPES.ForStatement && parent.test === current) {
      return true;
    }

    if (parent.type === AST_NODE_TYPES.LogicalExpression) {
      return true;
    }

    current = parent;
    parent = parent.parent ?? null;
  }

  return false;
}

function hasManualCancellationPattern(
  context: RuleContext<string, unknown[]>,
  callback: EffectCallback
) {
  if (callback.params.length > 0 || callback.body.type !== AST_NODE_TYPES.BlockStatement) return false;

  const cleanupFns = getCleanupFunctions(callback);
  if (cleanupFns.length === 0) return false;

  for (let i = 0, len = callback.body.body.length; i < len; i++) {
    const statement = callback.body.body[i];
    if (statement.type !== AST_NODE_TYPES.VariableDeclaration) continue;

    for (let j = 0, declLen = statement.declarations.length; j < declLen; j++) {
      const declarator = statement.declarations[j];
      if (declarator.id.type !== AST_NODE_TYPES.Identifier) continue;

      const variable = findVariable(context.sourceCode.getScope(declarator.id), declarator.id);
      if (variable == null) continue;

      const hasCleanupWrite = cleanupFns.some((cleanupFn) => variable.references.some(
        (ref) => ref.isWrite() && isRangeInside(ref.identifier.range, cleanupFn.range)
      ));
      if (!hasCleanupWrite) continue;

      const hasConditionRead = variable.references.some((ref) => {
        if (ref.identifier.type !== AST_NODE_TYPES.Identifier) return false;
        if (ref.isWrite()) return false;
        if (!isRangeInside(ref.identifier.range, callback.range)) return false;
        if (cleanupFns.some((cleanupFn) => isRangeInside(ref.identifier.range, cleanupFn.range))) return false;
        return isConditionLikeReference(ref.identifier, callback);
      });

      if (hasConditionRead) return true;
    }
  }

  return false;
}

export default createRule({
  name: 'react-no-manual-use-effect-race-condition-prevention',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow manual cancellation flag patterns inside React useEffect for race condition cleanup. Prefer `useAbortableEffect` from `foxact/use-abortable-effect`.'
    },
    messages: {
      default: MESSAGE
    },
    schema: []
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isUseEffectCall(node)) return;

        const callback = getEffectCallback(node);
        if (callback == null || callback.params.length > 0) return;

        if (hasManualCancellationPattern(context, callback)) {
          context.report({
            node,
            messageId: 'default'
          });
        }
      }
    };
  }
});
