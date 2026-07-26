import { createRule } from '@/utils/create-eslint-rule';
import { AST_NODE_TYPES } from '@typescript-eslint/types';

export type MessageId = 'noExplicitSpread';

export default createRule({
  name: 'jsx-no-explicit-spread-props',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow spreading object literals in JSX.'
    },
    messages: {
      noExplicitSpread: 'Don\'t spread an object literal in JSX. Write each property as a separate prop instead.'
    },
    schema: []
  },
  create: (context) => ({
    JSXSpreadAttribute(node) {
      if (node.argument.type === AST_NODE_TYPES.ObjectExpression) {
        context.report({
          node,
          messageId: 'noExplicitSpread'
        });
      }
    }
  })
});
