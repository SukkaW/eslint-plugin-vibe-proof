import { createRule, isParserWithTypeInformation } from '@/utils/create-eslint-rule';
import { isGlobalReference } from '@/utils/ast';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import { ASTUtils } from '@typescript-eslint/utils';
import type { TSESLint } from '@typescript-eslint/utils';

const BMP_LIMIT = 0x1_00_00;
const MAX_CODE_POINT = 0x10_FF_FF;
const HIGH_SURROGATE_START = 0xD800;
const LOW_SURROGATE_END = 0xDFFF;

const EQUALITY_OPERATORS = new Set(['==', '===', '!=', '!==']);

function getStaticInteger(
  node: TSESTree.Node,
  sourceCode: Readonly<TSESLint.SourceCode>
): number | null {
  const value = ASTUtils.getStaticValue(node, sourceCode.getScope(node))?.value;
  return typeof value === 'number' && Number.isSafeInteger(value)
    ? value
    : null;
}

function isBmpCodeUnit(
  node: TSESTree.Node,
  sourceCode: Readonly<TSESLint.SourceCode>
): boolean {
  const value = getStaticInteger(node, sourceCode);
  return value != null && value >= 0 && value < BMP_LIMIT;
}

function isBmpScalarValue(value: number): boolean {
  return value >= 0
    && value < BMP_LIMIT
    && (value < HIGH_SURROGATE_START || value > LOW_SURROGATE_END);
}

function isAstralCodePoint(
  node: TSESTree.Node,
  sourceCode: Readonly<TSESLint.SourceCode>
): boolean {
  const value = getStaticInteger(node, sourceCode);
  return value != null && value >= BMP_LIMIT && value <= MAX_CODE_POINT;
}

function isValidCodePoint(
  node: TSESTree.Node,
  sourceCode: Readonly<TSESLint.SourceCode>
): boolean {
  const value = getStaticInteger(node, sourceCode);
  return value != null && value >= 0 && value <= MAX_CODE_POINT;
}

function getDirectMethodCall(
  node: TSESTree.CallExpression,
  methodName: string
): TSESTree.MemberExpression | null {
  if (
    node.optional
    || node.callee.type !== AST_NODE_TYPES.MemberExpression
    || node.callee.computed
    || node.callee.optional
    || node.callee.property.type !== AST_NODE_TYPES.Identifier
    || node.callee.property.name !== methodName
  ) {
    return null;
  }
  return node.callee;
}

function getGlobalStringMethodCall(
  node: TSESTree.CallExpression,
  methodName: string,
  sourceCode: Readonly<TSESLint.SourceCode>
): TSESTree.MemberExpression | null {
  const callee = getDirectMethodCall(node, methodName);
  return callee?.object.type === AST_NODE_TYPES.Identifier
    && callee.object.name === 'String'
    && isGlobalReference(sourceCode, callee.object)
    ? callee
    : null;
}

function getComparedInteger(node: TSESTree.CallExpression): TSESTree.Node | null {
  const parent = node.parent;
  if (
    parent.type !== AST_NODE_TYPES.BinaryExpression
    || !EQUALITY_OPERATORS.has(parent.operator)
  ) {
    return null;
  }
  if (parent.left === node) return parent.right;
  if (parent.right === node) return parent.left;
  return null;
}

export default createRule({
  name: 'prefer-string-code-point-operations',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer the fastest Unicode-safe string code-unit or code-point operation for statically known values.',
      recommended: 'recommended'
    },
    fixable: 'code',
    messages: {
      preferFromCharCode: 'Use `String.fromCharCode()` for BMP-only values; it is faster than `String.fromCodePoint()`.',
      preferFromCodePoint: 'Use `String.fromCodePoint()` for astral code points; `String.fromCharCode()` truncates values above `0xFFFF`.',
      preferCharCodeAt: 'Use `charCodeAt()` when comparing with the BMP scalar value `{{value}}`.',
      preferCodePointAt: 'Use `codePointAt()` when comparing with the astral code point `{{value}}`; `charCodeAt()` only returns one UTF-16 code unit.',
      preferCodePointAtForFromCodePoint: 'Use `codePointAt()` when passing the result to `String.fromCodePoint()`; `charCodeAt()` can split an astral character.'
    },
    schema: []
  },
  create(context) {
    const sourceCode = context.sourceCode;
    const services = sourceCode.parserServices;

    function isStringReceiver(node: TSESTree.Node): boolean {
      if (!isParserWithTypeInformation(services)) return true;
      const checker = services.program.getTypeChecker();
      const type = checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(node));
      return checker.isTypeAssignableTo(type, checker.getStringType());
    }

    function reportStaticConstructor(node: TSESTree.CallExpression): boolean {
      const fromCodePoint = getGlobalStringMethodCall(node, 'fromCodePoint', sourceCode);
      if (fromCodePoint != null) {
        if (
          node.arguments.length === 0
          || !node.arguments.every(arg => isBmpCodeUnit(arg, sourceCode))
        ) return false;
        context.report({
          node: fromCodePoint.property,
          messageId: 'preferFromCharCode',
          fix: fixer => fixer.replaceText(fromCodePoint.property, 'fromCharCode')
        });
        return true;
      }

      const fromCharCode = getGlobalStringMethodCall(node, 'fromCharCode', sourceCode);
      if (
        fromCharCode == null
        || !node.arguments.some(arg => isAstralCodePoint(arg, sourceCode))
      ) return false;

      const fixable = node.arguments.every(arg => isValidCodePoint(arg, sourceCode));
      context.report({
        node: fromCharCode.property,
        messageId: 'preferFromCodePoint',
        fix: fixable
          ? fixer => fixer.replaceText(fromCharCode.property, 'fromCodePoint')
          : null
      });
      return true;
    }

    function reportCodePointAtForConstructor(
      node: TSESTree.CallExpression,
      callee: TSESTree.MemberExpression
    ): boolean {
      const parent = node.parent;
      if (
        parent.type !== AST_NODE_TYPES.CallExpression
        || !parent.arguments.includes(node)
        || getGlobalStringMethodCall(parent, 'fromCodePoint', sourceCode) == null
      ) {
        return false;
      }

      context.report({
        node: callee.property,
        messageId: 'preferCodePointAtForFromCodePoint'
      });
      return true;
    }

    return {
      CallExpression(node) {
        if (reportStaticConstructor(node)) return;

        const charCodeAt = getDirectMethodCall(node, 'charCodeAt');
        if (charCodeAt != null && isStringReceiver(charCodeAt.object)) {
          if (reportCodePointAtForConstructor(node, charCodeAt)) return;

          const compared = getComparedInteger(node);
          if (compared != null && isAstralCodePoint(compared, sourceCode)) {
            context.report({
              node: charCodeAt.property,
              messageId: 'preferCodePointAt',
              data: { value: sourceCode.getText(compared) },
              fix: fixer => fixer.replaceText(charCodeAt.property, 'codePointAt')
            });
          }
          return;
        }

        const codePointAt = getDirectMethodCall(node, 'codePointAt');
        if (codePointAt == null || !isStringReceiver(codePointAt.object)) return;

        const compared = getComparedInteger(node);
        const value = compared == null ? null : getStaticInteger(compared, sourceCode);
        if (compared != null && value != null && isBmpScalarValue(value)) {
          context.report({
            node: codePointAt.property,
            messageId: 'preferCharCodeAt',
            data: { value: sourceCode.getText(compared) },
            fix: fixer => fixer.replaceText(codePointAt.property, 'charCodeAt')
          });
        }
      }
    };
  }
});
