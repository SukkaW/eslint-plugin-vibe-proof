import { createRule } from '@/utils/create-eslint-rule';
import { isUseStateLikeCall } from '@/utils/react-hooks';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import { ASTUtils } from '@typescript-eslint/utils';

export default createRule({
  name: 'react-no-use-state-as-ref',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow using useState without its setter. Use `useRef` or `useSingleton` from `foxact/use-singleton` instead.'
    },
    messages: {
      default: 'useState is used without the setter "{{setter}}". If you only need the value, use `useRef` or `useSingleton` from `foxact/use-singleton` instead.'
    },
    schema: []
  },
  create(context) {
    return {
      VariableDeclarator(node) {
        if (node.id.type !== AST_NODE_TYPES.ArrayPattern) return;
        if (node.init == null || !isUseStateLikeCall(node.init)) return;

        const elements = node.id.elements;

        // Must have at least the value element
        if (elements.length === 0 || elements[0] == null) return;

        // const [value] = useState(...) — no setter destructured at all
        if (elements.length === 1) {
          context.report({
            node,
            messageId: 'default',
            data: { setter: 'setState' }
          });
          return;
        }

        const setter = elements[1];
        if (setter == null) return;

        // const [value, _setter] = useState(...) — setter is explicitly ignored with underscore prefix
        if (setter.type === AST_NODE_TYPES.Identifier && setter.name[0] === '_') {
          context.report({
            node,
            messageId: 'default',
            data: { setter: setter.name }
          });
          return;
        }

        // Check if the setter identifier has zero references (never used)
        if (setter.type !== AST_NODE_TYPES.Identifier) return;

        const variable = ASTUtils.findVariable(context.sourceCode.getScope(setter), setter.name);
        if (variable == null) return;

        // references includes the declaration itself for write, so filter to only reads
        const readRefs = variable.references.filter((ref) => ref.isRead());
        if (readRefs.length === 0) {
          context.report({
            node,
            messageId: 'default',
            data: { setter: setter.name }
          });
        }
      }
    };
  }
});
