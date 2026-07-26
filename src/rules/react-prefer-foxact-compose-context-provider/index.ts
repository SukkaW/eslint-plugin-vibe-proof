import { createRule } from '@/utils/create-eslint-rule';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';

const MIN_PROVIDER_CHAIN = 4;
const SUFFIXES = ['Provider', 'Config', 'Context', 'State', 'Providers'];

function getJsxElementName(node: TSESTree.JSXTagNameExpression): string | null {
  switch (node.type) {
    case AST_NODE_TYPES.JSXIdentifier:
      return node.name;
    case AST_NODE_TYPES.JSXMemberExpression:
      return node.property.name;
    case AST_NODE_TYPES.JSXNamespacedName:
      return node.name.name;
    default:
      return null;
  }
}

function isProviderLikeElement(node: TSESTree.JSXElement): boolean {
  const name = getJsxElementName(node.openingElement.name);
  return name != null && SUFFIXES.some((suffix) => name.endsWith(suffix));
}

function getSingleMeaningfulChildElement(node: TSESTree.JSXElement): TSESTree.JSXElement | null {
  const meaningfulChildren = node.children.filter((child) => {
    if (child.type === AST_NODE_TYPES.JSXText) {
      return child.value.trim().length > 0;
    }
    if (child.type === AST_NODE_TYPES.JSXExpressionContainer) {
      return child.expression.type !== AST_NODE_TYPES.JSXEmptyExpression;
    }
    return true;
  });

  return meaningfulChildren.length === 1 && meaningfulChildren[0].type === AST_NODE_TYPES.JSXElement
    ? meaningfulChildren[0]
    : null;
}

function isNestedProviderChainStart(node: TSESTree.JSXElement): boolean {
  const parent = node.parent;
  return parent?.type === AST_NODE_TYPES.JSXElement
    && isProviderLikeElement(parent)
    && getSingleMeaningfulChildElement(parent) === node;
}

export default createRule({
  name: 'react-prefer-foxact-compose-context-provider',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer `ComposeContextProvider` when many provider-like components are nested together.'
    },
    messages: {
      default: 'Too many nested provider-like components. Flatten them with a compose helper — e.g. `ComposeContextProvider` from `foxact/compose-context-provider`, or any equivalent utility you already use.'
    },
    schema: []
  },
  create(context) {
    return {
      JSXElement(node) {
        if (!isProviderLikeElement(node)) return;
        if (isNestedProviderChainStart(node)) return;

        let count = 1;
        let current = node;
        while (true) {
          const child = getSingleMeaningfulChildElement(current);
          if (child == null || !isProviderLikeElement(child)) break;
          count++;
          current = child;
        }

        if (count < MIN_PROVIDER_CHAIN) return;

        context.report({
          node: node.openingElement,
          messageId: 'default'
        });
      }
    };
  }
});
