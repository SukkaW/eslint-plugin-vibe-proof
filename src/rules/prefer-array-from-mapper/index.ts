import { createRule } from '@/utils/create-eslint-rule';
import { isGlobalReference } from '@/utils/ast';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import { ASTUtils } from '@typescript-eslint/utils';
import type { TSESLint } from '@typescript-eslint/utils';

function isMapCall(
  node: TSESTree.CallExpression,
  sourceCode: Readonly<TSESLint.SourceCode>
): node is TSESTree.CallExpression & {
  callee: TSESTree.MemberExpression,
  arguments: [TSESTree.CallExpressionArgument]
} {
  return !node.optional
    && node.arguments.length === 1
    && node.arguments[0].type !== AST_NODE_TYPES.SpreadElement
    && node.callee.type === AST_NODE_TYPES.MemberExpression
    && !node.callee.optional
    && ASTUtils.getPropertyName(
      node.callee,
      sourceCode.getScope(node.callee)
    ) === 'map';
}

function isMapperUsingArrayArgument(node: TSESTree.CallExpressionArgument): boolean {
  return ASTUtils.isFunction(node)
    && (node.params.length >= 3 || node.params.some(param => param.type === AST_NODE_TYPES.RestElement));
}

function getSpreadIterable(node: TSESTree.Node): TSESTree.Expression | null {
  if (
    node.type !== AST_NODE_TYPES.ArrayExpression
    || node.elements.length !== 1
    || node.elements[0]?.type !== AST_NODE_TYPES.SpreadElement
  ) {
    return null;
  }

  return node.elements[0].argument;
}

function getArrayFromIterable(
  node: TSESTree.Node,
  sourceCode: Readonly<TSESLint.SourceCode>
): TSESTree.Expression | null {
  if (
    node.type !== AST_NODE_TYPES.CallExpression
    || node.optional
    || node.arguments.length !== 1
    || node.arguments[0].type === AST_NODE_TYPES.SpreadElement
    || node.callee.type !== AST_NODE_TYPES.MemberExpression
    || node.callee.optional
    || node.callee.object.type !== AST_NODE_TYPES.Identifier
    || node.callee.object.name !== 'Array'
    || ASTUtils.getPropertyName(
      node.callee,
      sourceCode.getScope(node.callee)
    ) !== 'from'
    || !isGlobalReference(sourceCode, node.callee.object)
  ) {
    return null;
  }

  return node.arguments[0];
}

export default createRule({
  name: 'prefer-array-from-mapper',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer `Array.from(iterable, mapper)` over materializing an iterable and then calling `.map()`.',
      recommended: 'recommended'
    },
    fixable: 'code',
    messages: {
      preferArrayFromMapper: 'Use `Array.from({{iterable}}, {{mapper}})` to map the iterable without creating an intermediate array.'
    },
    schema: []
  },
  create(context) {
    const sourceCode = context.sourceCode;

    return {
      CallExpression(node) {
        if (!isMapCall(node, sourceCode)) return;

        const mapper = node.arguments[0];
        if (isMapperUsingArrayArgument(mapper)) return;

        const materialized = node.callee.object;
        let iterable = getArrayFromIterable(materialized, sourceCode);

        if (iterable == null) {
          iterable = getSpreadIterable(materialized);
          if (iterable == null) return;

          // This rewrite introduces an `Array` reference. Do not bind it to a
          // local variable that happens to shadow the global constructor.
          const arrayVariable = ASTUtils.findVariable(sourceCode.getScope(node), 'Array');
          if (arrayVariable != null && arrayVariable.defs.length > 0) return;
        }

        const iterableText = sourceCode.getText(iterable);
        const mapperText = sourceCode.getText(mapper);
        const replacement = `Array.from(${iterableText}, ${mapperText})`;
        const fixable = sourceCode.getCommentsInside(node).length === 0;

        context.report({
          node,
          messageId: 'preferArrayFromMapper',
          data: {
            iterable: iterableText,
            mapper: mapperText
          },
          fix: fixable
            ? fixer => fixer.replaceText(node, replacement)
            : null
        });
      }
    };
  }
});
