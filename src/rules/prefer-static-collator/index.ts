import { createRule } from '@/utils/create-eslint-rule';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import { ASTUtils } from '@typescript-eslint/utils';
import type { TSESLint } from '@typescript-eslint/utils';

const COMPARATOR_METHODS = new Set(['sort', 'toSorted']);

type FunctionExpr = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;

function findEnclosingCallback(node: TSESTree.Node): FunctionExpr | null {
  let cur: TSESTree.Node | undefined = node.parent;
  while (cur) {
    if (ASTUtils.isFunction(cur)) {
      return cur.type === AST_NODE_TYPES.FunctionDeclaration ? null : cur;
    }
    cur = cur.parent;
  }
  return null;
}

function isComparatorCallback(
  fn: FunctionExpr,
  sourceCode: Readonly<TSESLint.SourceCode>
): boolean {
  const parent = fn.parent;
  if (parent.type !== AST_NODE_TYPES.CallExpression) return false;
  const callee = parent.callee;
  if (callee.type !== AST_NODE_TYPES.MemberExpression) return false;
  const propertyName = ASTUtils.getPropertyName(callee, sourceCode.getScope(callee));
  if (propertyName == null || !COMPARATOR_METHODS.has(propertyName)) return false;
  return parent.arguments.includes(fn);
}

export default createRule({
  name: 'prefer-static-collator',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer hoisting an `Intl.Collator` instance over calling localeCompare in a sort callback'
    },
    schema: [],
    messages: {
      preferStaticCollator:
        '`localeCompare` constructs an `Intl.Collator` on every call. Hoist `const collator = new Intl.Collator(...)` outside the callback and use `collator.compare(a, b)`.'
    }
  },
  create(context) {
    const { sourceCode } = context;
    return {
      CallExpression(node) {
        if (node.callee.type !== AST_NODE_TYPES.MemberExpression) return;
        if (ASTUtils.getPropertyName(
          node.callee,
          sourceCode.getScope(node.callee)
        ) !== 'localeCompare') return;
        const fn = findEnclosingCallback(node);
        if (!fn) return;
        if (!isComparatorCallback(fn, sourceCode)) return;
        context.report({ node, messageId: 'preferStaticCollator' });
      }
    };
  }
});
