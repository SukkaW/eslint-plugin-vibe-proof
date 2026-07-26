import { createRule } from '@/utils/create-eslint-rule';
import { isGlobalReference, isGlobalMemberAccess, unwrapExpression } from '@/utils/ast';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import type { TSESLint } from '@typescript-eslint/utils';

const MESSAGE = 'Do not use copy-related Web APIs in React code. Use `foxact/use-clipboard` instead.';

function isNavigatorObject(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Expression
): boolean {
  const expression = unwrapExpression(node);

  // navigator
  if (expression.type === AST_NODE_TYPES.Identifier) {
    return isGlobalReference(sourceCode, expression) && expression.name === 'navigator';
  }

  // window.navigator / globalThis.navigator / self.navigator
  if (expression.type === AST_NODE_TYPES.MemberExpression) {
    return isGlobalMemberAccess(sourceCode, expression, 'window', 'navigator')
      || isGlobalMemberAccess(sourceCode, expression, 'globalThis', 'navigator')
      || isGlobalMemberAccess(sourceCode, expression, 'self', 'navigator');
  }

  return false;
}

function isClipboardAccess(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.MemberExpression
): boolean {
  if (node.computed || node.property.type !== AST_NODE_TYPES.Identifier || node.property.name !== 'clipboard') {
    return false;
  }
  return isNavigatorObject(sourceCode, node.object);
}

function isDocumentObject(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Expression
): boolean {
  const expression = unwrapExpression(node);

  if (expression.type === AST_NODE_TYPES.Identifier) {
    return isGlobalReference(sourceCode, expression) && expression.name === 'document';
  }

  return isGlobalMemberAccess(sourceCode, expression, 'window', 'document')
    || isGlobalMemberAccess(sourceCode, expression, 'globalThis', 'document');
}

function isCopyExecCommand(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.CallExpression
): boolean {
  if (
    node.callee.type !== AST_NODE_TYPES.MemberExpression
    || node.callee.computed
    || node.callee.property.type !== AST_NODE_TYPES.Identifier
    || node.callee.property.name !== 'execCommand'
  ) {
    return false;
  }

  if (!isDocumentObject(sourceCode, node.callee.object)) return false;

  const [firstArg] = node.arguments;
  return firstArg?.type === AST_NODE_TYPES.Literal
    && (firstArg.value === 'copy' || firstArg.value === 'cut');
}

export default createRule({
  name: 'react-prefer-foxact-use-clipboard',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow copy-related Web APIs in React code.'
    },
    messages: {
      default: MESSAGE
    },
    schema: []
  },
  create(context) {
    const { sourceCode } = context;

    return {
      MemberExpression(node) {
        if (isClipboardAccess(sourceCode, node)) {
          context.report({ node, messageId: 'default' });
        }
      },
      CallExpression(node) {
        if (isCopyExecCommand(sourceCode, node)) {
          context.report({ node, messageId: 'default' });
        }
      }
    };
  }
});
