import { createRule } from '@/utils/create-eslint-rule';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import type { Scope } from '@typescript-eslint/utils/ts-eslint';
import { findVariable } from '@typescript-eslint/utils/ast-utils';
import { isUseStateLikeCall } from '@/utils/react-hooks';

export default createRule({
  name: 'react-prefer-state-updater-function',
  meta: {
    type: 'problem',
    docs: {
      description: 'Prefer using the state updater function form when updating state in React.'
    },
    messages: {
      default: 'Do not reference {{name}} directly; use the updater function form instead.'
    },
    schema: []
  },
  create(context) {
    const setterToStateVar = new Map<Scope.Variable, Scope.Variable>();
    const pendingCalls: Array<{ callerVar: Scope.Variable, node: TSESTree.CallExpression }> = [];

    return {
      CallExpression(node: TSESTree.CallExpression) {
        // this special trick is to overcome is.useStateLikeCall's wrong types
        // where it return asserts node is TSESTree.CallExpression, but it actually
        // accepts any CallExpression and returns boolean
        const n: TSESTree.Expression = node;
        if (isUseStateLikeCall(n)) {
          const { parent } = node;
          if (
            parent.type === AST_NODE_TYPES.VariableDeclarator
            && parent.id.type === AST_NODE_TYPES.ArrayPattern
          ) {
            const [stateEl, setterEl] = parent.id.elements;
            if (stateEl?.type === AST_NODE_TYPES.Identifier && setterEl?.type === AST_NODE_TYPES.Identifier) {
              const scope = context.sourceCode.getScope(node);
              const stateVar = findVariable(scope, stateEl.name);
              const setterVar = findVariable(scope, setterEl.name);
              if (stateVar != null && setterVar != null) {
                setterToStateVar.set(setterVar, stateVar);
              }
            }
          }
          return;
        }

        if (node.callee.type !== AST_NODE_TYPES.Identifier) return;
        const scope = context.sourceCode.getScope(node);
        const callerVar = findVariable(scope, node.callee.name);
        if (callerVar != null) {
          pendingCalls.push({ callerVar, node });
        }
      },

      'Program:exit': function () {
        for (const { callerVar, node } of pendingCalls) {
          if (!setterToStateVar.has(callerVar)) continue;
          if (node.arguments.length === 0) continue;
          const stateVar = setterToStateVar.get(callerVar)!;
          const arg = node.arguments[0];
          if (isFunction(arg)) continue;

          const [argStart, argEnd] = arg.range;
          const hasStateRef = stateVar.references.some(
            (ref) => argStart <= ref.identifier.range[0]
              && ref.identifier.range[1] <= argEnd
          );

          if (hasStateRef) {
            context.report({
              node,
              messageId: 'default',
              data: { name: context.sourceCode.getText(node.callee) }
            });
          }
        }
      }
    };
  }
});

function isFunction({ type }: TSESTree.Node) {
  return type === AST_NODE_TYPES.FunctionDeclaration || type === AST_NODE_TYPES.FunctionExpression || type === AST_NODE_TYPES.ArrowFunctionExpression;
}
