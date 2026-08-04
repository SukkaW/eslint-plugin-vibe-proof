import { createRule } from '@/utils/create-eslint-rule';
import type { RuleContext } from '@/utils/create-eslint-rule';
import { isInBooleanContext, isNullish } from '@/utils/ast';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import { ASTUtils } from '@typescript-eslint/utils';
import type { TSESLint } from '@typescript-eslint/utils';

type MessageIds = 'preferArraySome';

function isArrayMethodCall(
  node: TSESTree.Expression,
  methodName: 'find' | 'filter',
  sourceCode: Readonly<TSESLint.SourceCode>
): node is TSESTree.CallExpression {
  return node.type === AST_NODE_TYPES.CallExpression
    && node.callee.type === AST_NODE_TYPES.MemberExpression
    && ASTUtils.getPropertyName(
      node.callee,
      sourceCode.getScope(node.callee)
    ) === methodName
    && node.arguments.length >= 1;
}

function isFindCall(
  node: TSESTree.Expression,
  sourceCode: Readonly<TSESLint.SourceCode>
): node is TSESTree.CallExpression {
  return isArrayMethodCall(node, 'find', sourceCode);
}

function isFilterLengthCall(
  node: TSESTree.Expression,
  sourceCode: Readonly<TSESLint.SourceCode>
): node is TSESTree.MemberExpression {
  return node.type === AST_NODE_TYPES.MemberExpression
    && ASTUtils.getPropertyName(node, sourceCode.getScope(node)) === 'length'
    && node.object.type === AST_NODE_TYPES.CallExpression
    && isArrayMethodCall(node.object, 'filter', sourceCode);
}

function reportFind(
  context: RuleContext<MessageIds, unknown[]>,
  node: TSESTree.Node,
  findCall: TSESTree.CallExpression,
  shouldNegate: boolean
) {
  if (findCall.callee.type !== AST_NODE_TYPES.MemberExpression) return;

  const sourceCode = context.sourceCode;
  const arrayText = sourceCode.getText(findCall.callee.object);
  const argsText = findCall.arguments.map(arg => sourceCode.getText(arg)).join(', ');
  const replacement = shouldNegate
    ? `!${arrayText}.some(${argsText})`
    : `${arrayText}.some(${argsText})`;

  context.report({
    node,
    messageId: 'preferArraySome',
    fix: fixer => fixer.replaceText(node, replacement)
  });
}

function reportFilterLength(
  context: Readonly<RuleContext<MessageIds, unknown[]>>,
  node: TSESTree.Node,
  filterLengthCall: TSESTree.MemberExpression,
  shouldNegate: boolean
) {
  if (filterLengthCall.object.type !== AST_NODE_TYPES.CallExpression) return;
  if (filterLengthCall.object.callee.type !== AST_NODE_TYPES.MemberExpression) return;

  const sourceCode = context.sourceCode;
  const arrayText = sourceCode.getText(filterLengthCall.object.callee.object);
  const argsText = filterLengthCall.object.arguments.map(arg => sourceCode.getText(arg)).join(', ');
  const replacement = shouldNegate
    ? `!${arrayText}.some(${argsText})`
    : `${arrayText}.some(${argsText})`;

  context.report({
    node,
    messageId: 'preferArraySome',
    fix: fixer => fixer.replaceText(node, replacement)
  });
}

function checkBinaryExpression(node: TSESTree.BinaryExpression, context: Readonly<RuleContext<MessageIds, unknown[]>>) {
  const { sourceCode } = context;
  const { left, right, operator } = node;
  if (left.type === AST_NODE_TYPES.PrivateIdentifier) return;

  let findCall: TSESTree.CallExpression | undefined;
  let filterLengthCall: TSESTree.MemberExpression | undefined;
  let constantSide: TSESTree.Expression;

  if (isFindCall(left, sourceCode)) {
    findCall = left;
    constantSide = right;
  } else if (isFindCall(right, sourceCode)) {
    findCall = right;
    constantSide = left;
  } else if (isFilterLengthCall(left, sourceCode)) {
    filterLengthCall = left;
    constantSide = right;
  } else if (isFilterLengthCall(right, sourceCode)) {
    filterLengthCall = right;
    constantSide = left;
  } else {
    return;
  }

  if (findCall !== undefined) {
    const nullishType = isNullish(constantSide);
    if (!nullishType) return;

    if (operator === '===' || operator === '!==') {
      if (nullishType !== 'undefined') return;
      reportFind(context, node, findCall, operator === '===');
    }
    return;
  }

  if (filterLengthCall !== undefined) {
    let ltrOperator = operator;
    if (left === constantSide) {
      ltrOperator = ({
        '>': '<',
        '<': '>',
        '<=': '>=',
        '>=': '<='
      } as Partial<Record<typeof operator, typeof operator>>)[operator] ?? operator;
    }

    if (constantSide.type === AST_NODE_TYPES.Literal && constantSide.value === 0) {
      if (ltrOperator === '===' || ltrOperator === '<=') {
        reportFilterLength(context, node, filterLengthCall, true);
      } else if (ltrOperator === '!==' || ltrOperator === '>') {
        reportFilterLength(context, node, filterLengthCall, false);
      }
    } else if (constantSide.type === AST_NODE_TYPES.Literal && constantSide.value === 1) {
      if (ltrOperator === '<') {
        reportFilterLength(context, node, filterLengthCall, true);
      } else if (ltrOperator === '>=') {
        reportFilterLength(context, node, filterLengthCall, false);
      }
    }
  }
}

function checkUnaryExpression(node: TSESTree.UnaryExpression, context: RuleContext<MessageIds, unknown[]>) {
  const { sourceCode } = context;
  if (node.operator === '!' && isFindCall(node.argument, sourceCode)) {
    reportFind(context, node, node.argument, true);
    return;
  }

  if (node.operator === '!' && isFilterLengthCall(node.argument, sourceCode)) {
    reportFilterLength(context, node, node.argument, true);
    return;
  }

  if (
    node.operator === '!'
    && node.argument.type === AST_NODE_TYPES.UnaryExpression
    && node.argument.operator === '!'
    && isFindCall(node.argument.argument, sourceCode)
  ) {
    reportFind(context, node, node.argument.argument, false);
    return;
  }

  if (
    node.operator === '!'
    && node.argument.type === AST_NODE_TYPES.UnaryExpression
    && node.argument.operator === '!'
    && isFilterLengthCall(node.argument.argument, sourceCode)
  ) {
    reportFilterLength(context, node, node.argument.argument, false);
  }
}

export default createRule({
  name: 'prefer-array-some',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer `Array.some()` over `Array.find()` and `Array.filter().length` checks when checking for element existence.',
      recommended: 'recommended'
    },
    fixable: 'code',
    messages: {
      preferArraySome: 'Use `Array.some()` instead of `Array.find()` and `Array.filter().length` checks when checking for element existence.'
    },
    schema: []
  },
  create(context) {
    return {
      BinaryExpression(node) {
        checkBinaryExpression(node, context);
      },
      UnaryExpression(node) {
        if (
          node.operator === '!'
          && node.parent.type === AST_NODE_TYPES.UnaryExpression
          && node.parent.operator === '!'
        ) {
          return;
        }
        checkUnaryExpression(node, context);
      },
      CallExpression(node) {
        if (
          node.parent.type === AST_NODE_TYPES.UnaryExpression
          || node.parent.type === AST_NODE_TYPES.BinaryExpression
          || !isFindCall(node, context.sourceCode)
        ) {
          return;
        }
        if (isInBooleanContext(node)) reportFind(context, node, node, false);
      },
      MemberExpression(node) {
        if (
          node.parent.type === AST_NODE_TYPES.UnaryExpression
          || node.parent.type === AST_NODE_TYPES.BinaryExpression
          || !isFilterLengthCall(node, context.sourceCode)
        ) {
          return;
        }
        if (isInBooleanContext(node)) reportFilterLength(context, node, node, false);
      }
    };
  }
});
