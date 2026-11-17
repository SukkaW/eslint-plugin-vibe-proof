import { createRule, ensureParserWithTypeInformation } from '@/utils/create-eslint-rule';
import { getTextWithParens } from '@/utils/ast';
import { couldBeUndefinedType } from '@/utils/type-aware';
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

// Binary operators that bind no tighter than `===`
const EQUALITY_OR_LOOSER_OPERATORS = new Set(['==', '!=', '===', '!==', '&', '^', '|']);

// Whether the expression would re-associate on the right-hand side of `===`
function isLooserThanEquality(node: TSESTree.Node): boolean {
  switch (node.type) {
    case AST_NODE_TYPES.ArrowFunctionExpression:
    case AST_NODE_TYPES.AssignmentExpression:
    case AST_NODE_TYPES.ConditionalExpression:
    case AST_NODE_TYPES.LogicalExpression:
    case AST_NODE_TYPES.SequenceExpression:
    case AST_NODE_TYPES.YieldExpression:
      return true;
    case AST_NODE_TYPES.BinaryExpression:
      return EQUALITY_OR_LOOSER_OPERATORS.has(node.operator);
    default:
      return false;
  }
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

        if (compareIndex === undefined || indexOfCall?.callee.type !== AST_NODE_TYPES.MemberExpression
          || ASTUtils.getPropertyName(
            indexOfCall.callee,
            sourceCode.getScope(indexOfCall.callee)
          ) !== 'indexOf'
          || indexOfCall.arguments.length !== 1
          || indexOfCall.arguments[0].type === AST_NODE_TYPES.SpreadElement) {
          return;
        }

        const objectNode = indexOfCall.callee.object;
        const searchArg = indexOfCall.arguments[0];
        const type = checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(objectNode));
        const objectText = getTextWithParens(sourceCode, objectNode);
        const searchText = getTextWithParens(sourceCode, searchArg);
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

        // `indexOf` returns the first match and skips holes, which direct
        // access reads as `undefined`: only index 0 with a searched value that
        // cannot be `undefined` is equivalent
        if (
          compareIndex === 0
          && checker.isArrayType(type)
          && !couldBeUndefinedType(checker, checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(searchArg)))
        ) {
          const itemText = isLooserThanEquality(searchArg) ? `(${sourceCode.getText(searchArg)})` : searchText;
          context.report({
            node,
            messageId: 'preferDirectAccess',
            data: {
              array: objectText,
              item: itemText,
              index: String(compareIndex)
            },
            fix: fixer => fixer.replaceText(
              node,
              `${objectText}[${compareIndex}] === ${itemText}`
            )
          });
        }
      }
    };
  }
});
