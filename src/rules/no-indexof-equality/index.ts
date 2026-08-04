import { createRule, ensureParserWithTypeInformation } from '@/utils/create-eslint-rule';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import { ASTUtils } from '@typescript-eslint/utils';
import type { TSESLint } from '@typescript-eslint/utils';

function getStaticIndex(
  node: TSESTree.Node,
  sourceCode: Readonly<TSESLint.SourceCode>
): number | null {
  const value = ASTUtils.getStaticValue(node, sourceCode.getScope(node))?.value;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

export default createRule({
  name: 'no-indexof-equality',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer optimized alternatives to `indexOf()` equality checks.',
      recommended: 'recommended'
    },
    fixable: 'code',
    messages: {
      preferDirectAccess: 'Use direct array access `{{array}}[{{index}}] === {{item}}` instead of `indexOf() === {{index}}`.',
      preferStartsWith: 'Use `.startsWith()` instead of `indexOf() === 0` for strings.'
    },
    schema: []
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const services = sourceCode.parserServices;
    ensureParserWithTypeInformation(services);
    const checker = services.program.getTypeChecker();

    return {
      BinaryExpression(node) {
        if (node.operator !== '===' && node.operator !== '==') return;

        let indexOfCall: TSESTree.CallExpression | undefined;
        let compareIndex: number | undefined;

        if (node.left.type === AST_NODE_TYPES.CallExpression) {
          const index = getStaticIndex(node.right, sourceCode);
          if (index != null) {
            indexOfCall = node.left;
            compareIndex = index;
          }
        } else if (node.right.type === AST_NODE_TYPES.CallExpression) {
          const index = getStaticIndex(node.left, sourceCode);
          if (index != null) {
            indexOfCall = node.right;
            compareIndex = index;
          }
        }

        if (compareIndex === undefined || indexOfCall == null) return;

        if (
          indexOfCall.callee.type !== AST_NODE_TYPES.MemberExpression
          || ASTUtils.getPropertyName(
            indexOfCall.callee,
            sourceCode.getScope(indexOfCall.callee)
          ) !== 'indexOf'
          || indexOfCall.arguments.length !== 1
          || indexOfCall.arguments[0].type === AST_NODE_TYPES.SpreadElement
        ) {
          return;
        }

        const objectNode = indexOfCall.callee.object;
        const searchArg = indexOfCall.arguments[0];
        const type = checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(objectNode));
        const objectText = sourceCode.getText(objectNode);
        const searchText = sourceCode.getText(searchArg);
        const stringType = checker.getStringType();

        if (checker.isTypeAssignableTo(type, stringType)) {
          if (compareIndex === 0) {
            context.report({
              node,
              messageId: 'preferStartsWith',
              fix: fixer => fixer.replaceText(node, `${objectText}.startsWith(${searchText})`)
            });
          }
          return;
        }

        if (checker.isArrayType(type)) {
          context.report({
            node,
            messageId: 'preferDirectAccess',
            data: {
              array: objectText,
              item: searchText,
              index: String(compareIndex)
            },
            fix: fixer => fixer.replaceText(
              node,
              `${objectText}[${compareIndex}] === ${searchText}`
            )
          });
        }
      }
    };
  }
});
