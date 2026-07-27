import { createRule } from '@/utils/create-eslint-rule';
import { getTypeAware, couldBeArrayType } from '@/utils/type-aware';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';

const ARRAY_HIGH_ORDER_FUNCTIONS = new Set([
  'map',
  'filter',
  'reduce',
  'reduceRight',
  'forEach'
]);

export default createRule({
  name: 'no-chain-array-higher-order-functions',
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description: 'Prefer `.reduce` over chaining `.filter`, `.map` methods',
      recommended: 'recommended'
    },
    schema: [],
    messages: {
      detected: 'Detected the chaining of array methods: {{methods}}. Replace with `.reduce` or for loop to reduce array iterations and improve the performance.'
    }
  },
  create(context) {
    const typeAware = getTypeAware(context.sourceCode);

    return {
      MemberExpression(node) {
        if (isArrayHigherOrderFunction(node)) {
          const parent = node.parent as TSESTree.CallExpression;
          if (isArrayHigherOrderFunction(parent.parent)) {
            // with typed linting, skip method chains on non-array receivers
            // (e.g. a query builder with its own .filter().map())
            if (
              typeAware != null
              && !couldBeArrayType(typeAware.checker, typeAware.getTypeAtLocation(node.object))
            ) {
              return;
            }

            context.report({
              node: parent,
              messageId: 'detected',
              data: {
                methods: `arr.${(node.property as TSESTree.Identifier).name}().${(parent.parent.property as TSESTree.Identifier).name}()`
              }
            });
          }
        }
      }
    };
  }
});

function isArrayHigherOrderFunction(node: TSESTree.Node): node is TSESTree.MemberExpressionNonComputedName {
  if (node.type !== AST_NODE_TYPES.MemberExpression) {
    return false;
  }
  if (node.computed) {
    return false;
  }
  if (node.property.type !== AST_NODE_TYPES.Identifier) {
    return false;
  }
  return ARRAY_HIGH_ORDER_FUNCTIONS.has(node.property.name) && node.parent.type === AST_NODE_TYPES.CallExpression;
}
