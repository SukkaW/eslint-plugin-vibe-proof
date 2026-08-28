import { createRule } from '@/utils/create-eslint-rule';
import { isGlobalMemberAccess, unwrapExpression } from '@/utils/ast';
import { couldBeArrayType, getTypeAware } from '@/utils/type-aware';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';

// Every method here can be folded into a single reducer pass over the source.
//
// Deliberately absent:
// - `.sort()`/`.toSorted()`: the ordering has to be established before
//   insertion, so the intermediate array is unavoidable.
// - `.concat()`: two sources cannot be merged within one reducer pass.
// - `.slice()`/`.splice()`/`.toSpliced()`/`.with()`/`.fill()`/`.copyWithin()`:
//   positional selection needs a materialized array to index into.
// - `.find()`/`.at()`/`.join()`/`.some()` and friends: these do not return an
//   array at all, so `Object.fromEntries()` on them is a different mistake.
const ARRAY_TO_ENTRIES_METHODS = new Set([
  'filter',
  'flatMap',
  'keys',
  'map',
  'reduce',
  'reduceRight',
  'toReversed',
  'values'
]);

const METHOD_MESSAGE_IDS: Record<string, 'preferFilterReduce' | 'preferFlatReduce' | 'preferReverseReduce' | undefined> = {
  filter: 'preferFilterReduce',
  flatMap: 'preferFlatReduce',
  toReversed: 'preferReverseReduce'
};

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
      preferReduce: 'Avoid `Object.fromEntries(array.{{method}}(...))`, which builds an intermediate entries array. Build the object directly in a `.reduce()` instead, or in a `.reduceRight()` if a later entry must not overwrite an earlier one.',
      preferFlatReduce: 'Avoid `Object.fromEntries(array.flatMap(...))`, which builds an intermediate flattened array plus callback result arrays. If the source itself needs flattening, use `.flat().reduce()` to build the object; otherwise, reduce directly.',
      preferFilterReduce: 'Avoid `Object.fromEntries(array.filter(...))`, which builds an intermediate filtered array. Use `.reduce()` and skip the unwanted entries inside the reducer instead.',
      preferReverseReduce: 'Avoid `Object.fromEntries(array.toReversed())`, which builds an intermediate reversed array. Use `.reduceRight()` to build the object directly, which visits the entries in the same order.'
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
          messageId: METHOD_MESSAGE_IDS[arrayToEntriesCall.method] ?? 'preferReduce',
          data: {
            method: arrayToEntriesCall.method
          }
        });
      }
    };
  }
});
