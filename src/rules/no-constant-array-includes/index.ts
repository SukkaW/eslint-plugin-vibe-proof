import { createRule } from '@/utils/create-eslint-rule';
import type { TSESTree } from '@typescript-eslint/types';
import { ASTUtils } from '@typescript-eslint/utils';

export default createRule({
  name: 'no-constant-array-includes',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow `.includes()` on constant arrays. Use a `Set` with `.has()` for O(1) lookup instead.'
    },
    messages: {
      default: 'Do not use `.includes()` on a constant array. Use a `Set` with `.has()` instead.'
    },
    schema: []
  },
  create(context) {
    return {
      'CallExpression[callee.type="MemberExpression"][callee.property.name="includes"]': (node: TSESTree.CallExpression) => {
        const callee = node.callee as TSESTree.MemberExpression;
        const staticValue = ASTUtils.getStaticValue(callee.object, context.sourceCode.getScope(callee.object));
        // length > 0: getStaticValue resolves the *initial* value and ignores mutations,
        // so `const arr = []; arr.push(x); arr.includes(y)` resolves to []. Skip empty
        // arrays since they are almost certainly populated dynamically.
        if (staticValue != null && Array.isArray(staticValue.value) && staticValue.value.length > 0) {
          context.report({ node, messageId: 'default' });
        }
      }
    };
  }
});
