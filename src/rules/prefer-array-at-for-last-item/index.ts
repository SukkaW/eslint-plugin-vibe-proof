import { createRule, isParserWithTypeInformation } from '@/utils/create-eslint-rule';
import { isSimpleTarget } from '@/utils/ast';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import { ASTUtils } from '@typescript-eslint/utils';
import type { TSESLint } from '@typescript-eslint/utils';

const TYPED_ARRAY_NAMES = [
  'Int8Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'Int16Array',
  'Uint16Array',
  'Int32Array',
  'Uint32Array',
  'Float32Array',
  'Float64Array',
  'BigInt64Array',
  'BigUint64Array'
];

function isLengthAccess(
  node: TSESTree.Node,
  sourceCode: Readonly<TSESLint.SourceCode>
): node is TSESTree.MemberExpression {
  return node.type === AST_NODE_TYPES.MemberExpression
    && !node.optional
    && node.object.type !== AST_NODE_TYPES.Super
    && ASTUtils.getPropertyName(node, sourceCode.getScope(node)) === 'length';
}

function isReadAccess(node: TSESTree.MemberExpression): boolean {
  let current: TSESTree.Node = node;
  while (
    (current.parent.type === AST_NODE_TYPES.TSAsExpression
      || current.parent.type === AST_NODE_TYPES.TSNonNullExpression
      || current.parent.type === AST_NODE_TYPES.TSTypeAssertion
      || current.parent.type === AST_NODE_TYPES.TSSatisfiesExpression)
    && current.parent.expression === current
  ) {
    current = current.parent;
  }

  const parent = current.parent;
  switch (parent.type) {
    case AST_NODE_TYPES.AssignmentExpression:
    case AST_NODE_TYPES.AssignmentPattern:
      return parent.left !== current;
    case AST_NODE_TYPES.UpdateExpression:
      return parent.argument !== current;
    case AST_NODE_TYPES.UnaryExpression:
      return parent.operator !== 'delete';
    case AST_NODE_TYPES.ForInStatement:
    case AST_NODE_TYPES.ForOfStatement:
      return parent.left !== current;
    case AST_NODE_TYPES.ArrayPattern:
    case AST_NODE_TYPES.RestElement:
      return false;
    case AST_NODE_TYPES.Property:
      return parent.value !== current || parent.parent.type !== AST_NODE_TYPES.ObjectPattern;
    default:
      return true;
  }
}

export default createRule({
  name: 'prefer-array-at-for-last-item',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer `array.at(-1)` over `array[array.length - 1]` when accessing the last item.'
    },
    fixable: 'code',
    messages: {
      preferAt: 'Use `{{replacement}}` instead of length-based indexing for the last item.'
    },
    schema: []
  },
  create(context) {
    const { sourceCode } = context;
    const services = sourceCode.parserServices;

    function supportsAt(node: TSESTree.Node): boolean {
      if (!isParserWithTypeInformation(services)) return true;

      const checker = services.program.getTypeChecker();
      const type = checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(node));
      if (checker.isArrayType(type) || checker.isTupleType(type)) return true;

      const typeName = checker.typeToString(type);
      if (TYPED_ARRAY_NAMES.some(name => typeName.startsWith(name))) return true;

      return checker.isTypeAssignableTo(type, checker.getStringType());
    }

    return {
      MemberExpression(node) {
        if (!node.computed || !isReadAccess(node)) return;

        const index = node.property;
        if (
          index.type !== AST_NODE_TYPES.BinaryExpression
          || index.operator !== '-'
          || ASTUtils.getStaticValue(
            index.right,
            sourceCode.getScope(index.right)
          )?.value !== 1
          || !isLengthAccess(index.left, sourceCode)
        ) {
          return;
        }

        const receiver = node.object;
        if (receiver.type === AST_NODE_TYPES.Super) return;
        if (!supportsAt(receiver)) return;

        const receiverText = sourceCode.getText(receiver);
        if (receiverText !== sourceCode.getText(index.left.object)) return;

        const replacement = `${receiverText}${node.optional ? '?.' : '.'}at(-1)`;
        const fixable = isSimpleTarget(receiver)
          && sourceCode.getCommentsInside(node).length === 0;
        context.report({
          node,
          messageId: 'preferAt',
          data: { replacement },
          fix: fixable
            ? (fixer) => fixer.replaceText(node, replacement)
            : null
        });
      }
    };
  }
});
