import { createRule } from '@/utils/create-eslint-rule';
import { isGlobalMemberAccess, unwrapExpression } from '@/utils/ast';
import { couldBeArrayType, getTypeAware } from '@/utils/type-aware';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';

const ARRAY_TO_ENTRIES_METHODS = new Set([
  'flatMap',
  'map',
  'reduce',
  'reduceRight'
]);

interface ArrayToEntriesCall {
  method: string,
  receiver: TSESTree.Expression
}

function getArrayToEntriesCall(
  node: TSESTree.CallExpression['arguments'][number]
): ArrayToEntriesCall | null {
  if (node.type === AST_NODE_TYPES.SpreadElement) return null;

  const expression = unwrapExpression(node);
  if (expression.type !== AST_NODE_TYPES.CallExpression) return null;

  const callee = unwrapExpression(expression.callee);
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression
    || callee.computed
    || callee.property.type !== AST_NODE_TYPES.Identifier
    || !ARRAY_TO_ENTRIES_METHODS.has(callee.property.name)
  ) {
    return null;
  }

  return {
    method: callee.property.name,
    receiver: callee.object
  };
}

export default createRule({
  name: 'prefer-array-reduce-to-object',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Build objects directly instead of passing an array produced by `.flatMap()`, `.map()`, `.reduce()`, or `.reduceRight()` to `Object.fromEntries()`.',
      recommended: 'recommended'
    },
    schema: [],
    messages: {
      preferReduce: 'Avoid `Object.fromEntries(array.{{method}}(...))`, which builds an intermediate entries array. Use `.reduce()` to build the object directly instead.',
      preferFlatReduce: 'Avoid `Object.fromEntries(array.flatMap(...))`, which builds an intermediate flattened array plus callback result arrays. If the source itself needs flattening, use `.flat().reduce()` to build the object; otherwise, reduce directly.'
    }
  },
  create(context) {
    const typeAware = getTypeAware(context.sourceCode);

    return {
      CallExpression(node) {
        if (
          !isGlobalMemberAccess(
            context.sourceCode,
            node.callee,
            'Object',
            'fromEntries'
          )
          || node.arguments.length === 0
        ) {
          return;
        }

        const arrayToEntriesCall = getArrayToEntriesCall(node.arguments[0]);
        if (arrayToEntriesCall == null) return;

        // With typed linting, do not mistake a user-defined `.flatMap()`,
        // `.map()`, `.reduce()`, or `.reduceRight()` method for an Array
        // method. Unknown types retain the syntactic fallback.
        if (
          typeAware != null
          && !couldBeArrayType(
            typeAware.checker,
            typeAware.getTypeAtLocation(arrayToEntriesCall.receiver)
          )
        ) {
          return;
        }

        context.report({
          node,
          messageId: arrayToEntriesCall.method === 'flatMap'
            ? 'preferFlatReduce'
            : 'preferReduce',
          data: {
            method: arrayToEntriesCall.method
          }
        });
      }
    };
  }
});
