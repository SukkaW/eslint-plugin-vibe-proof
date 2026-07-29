import { createRule, ensureParserWithTypeInformation } from '@/utils/create-eslint-rule';
import { isDefinitelyIndexableArrayType } from '@/utils/type-aware';
import { walkNodes } from '@/utils/ast';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import { ASTUtils } from '@typescript-eslint/utils';

export default createRule({
  name: 'prefer-indexed-array-loop',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce indexed `for` loops with a cached length over `for...of` when iterating arrays.',
      recommended: 'recommended',
      requiresTypeChecking: true
    },
    messages: {
      noForOfArray: 'Do not iterate an array with `for...of` — an indexed `for` loop is up to 3x faster. Use `for (let i = 0, len = arr.length; i < len; i++) { const item = arr[i]; }` (index and access once per iteration).',
      uncachedLength: 'Cache the array length in the loop initializer instead of reading `.length` on every iteration: `for (let i = 0, len = arr.length; i < len; i++)`.'
    },
    schema: []
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    ensureParserWithTypeInformation(services);
    const checker = services.program.getTypeChecker();

    return {
      ForOfStatement(node) {
        // `for await...of` awaits each element — not an indexed iteration
        if (node.await) return;

        if (isDefinitelyIndexableArrayType(checker, services.getTypeAtLocation(node.right))) {
          context.report({ node, messageId: 'noForOfArray' });
        }
      },
      ForStatement(node) {
        if (node.test == null) return;

        // the test expression re-evaluates on every iteration — any array
        // `.length` read inside it should be cached in the initializer
        walkNodes(node.test, context.sourceCode.visitorKeys, (n) => {
          if (ASTUtils.isFunction(n)) return false;
          if (
            n.type === AST_NODE_TYPES.MemberExpression
            && !n.computed
            && n.property.type === AST_NODE_TYPES.Identifier
            && n.property.name === 'length'
            && isDefinitelyIndexableArrayType(checker, services.getTypeAtLocation(n.object))
          ) {
            context.report({ node: n, messageId: 'uncachedLength' });
          }
        });
      }
    };
  }
});
