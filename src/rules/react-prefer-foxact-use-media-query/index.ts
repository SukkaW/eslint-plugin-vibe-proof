import { createRule } from '@/utils/create-eslint-rule';
import { isGlobalReference, isGlobalMemberAccess, unwrapExpression } from '@/utils/ast';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import type { TSESLint } from '@typescript-eslint/utils';

const MESSAGE = 'Do not use `matchMedia` or `window.matchMedia` directly in React code. Use `foxact/use-media-query` instead.';

function isWindowLikeObject(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Expression
): boolean {
  const expression = unwrapExpression(node);

  if (expression.type === AST_NODE_TYPES.Identifier && isGlobalReference(sourceCode, expression)) {
    return expression.name === 'window'
      || expression.name === 'globalThis'
      || expression.name === 'self';
  }

  // globalThis.window / self.window
  if (expression.type === AST_NODE_TYPES.MemberExpression) {
    return isGlobalMemberAccess(sourceCode, expression, 'globalThis', 'window')
      || isGlobalMemberAccess(sourceCode, expression, 'self', 'window');
  }

  return false;
}

function isGlobalMatchMediaCall(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.CallExpression
): boolean {
  const callee = unwrapExpression(node.callee);

  // window.matchMedia(...) / globalThis.matchMedia(...) etc.
  if (
    callee.type === AST_NODE_TYPES.MemberExpression
    && !callee.computed
    && callee.property.type === AST_NODE_TYPES.Identifier
    && callee.property.name === 'matchMedia'
  ) {
    return isWindowLikeObject(sourceCode, callee.object);
  }

  // bare matchMedia(...)
  return callee.type === AST_NODE_TYPES.Identifier
    && callee.name === 'matchMedia'
    && isGlobalReference(sourceCode, callee);
}

export default createRule({
  name: 'react-prefer-foxact-use-media-query',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow direct matchMedia usage in React code.'
    },
    messages: {
      default: MESSAGE
    },
    schema: []
  },
  create(context) {
    const { sourceCode } = context;

    return {
      CallExpression(node) {
        if (!isGlobalMatchMediaCall(sourceCode, node)) return;
        context.report({ node, messageId: 'default' });
      }
    };
  }
});
