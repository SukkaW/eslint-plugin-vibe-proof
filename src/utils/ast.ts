import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import type { TSESLint } from '@typescript-eslint/utils';
import { findVariable } from '@typescript-eslint/utils/ast-utils';

export const RE_NEWLINE = /\r\n?|\n/;

/**
 * Depth-first walk over a node's descendants (including the node itself),
 * using ESLint visitor keys so only real AST children are visited. Return
 * `false` from `visit` to stop descending into that node's children.
 */
export function walkNodes(
  root: TSESTree.Node,
  visitorKeys: TSESLint.SourceCode.VisitorKeys,
  visit: (node: TSESTree.Node) => boolean | void
): void {
  const stack: TSESTree.Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (visit(node) === false) continue;

    const keys = visitorKeys[node.type] as readonly string[] | undefined;
    if (keys == null) continue;
    for (const key of keys) {
      // Array children may be holey (e.g. `ArrayExpression.elements` for `[a, , b]`)
      const child = node[key as keyof typeof node] as TSESTree.Node | Array<TSESTree.Node | null> | null | undefined;
      if (Array.isArray(child)) {
        for (const c of child) {
          if (c != null) stack.push(c);
        }
      } else if (child != null) {
        stack.push(child);
      }
    }
  }
}

export function isGlobalReference(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node | null
): boolean {
  if (node?.type !== AST_NODE_TYPES.Identifier) return false;

  const variable = findVariable(sourceCode.getScope(node), node);
  return variable == null || variable.defs.length === 0;
}

// Identifier / this, or a non-computed member chain on one — an expression
// that is cheap and side-effect-free to repeat in an autofix.
export function isSimpleTarget(node: TSESTree.Node): boolean {
  let current = node;
  while (current.type === AST_NODE_TYPES.MemberExpression && !current.computed) {
    current = current.object;
  }
  return current.type === AST_NODE_TYPES.Identifier || current.type === AST_NODE_TYPES.ThisExpression;
}

export function unwrapExpression(node: TSESTree.Expression): TSESTree.Expression {
  let current = node;
  while (true) {
    switch (current.type) {
      case AST_NODE_TYPES.ChainExpression:
      case AST_NODE_TYPES.TSAsExpression:
      case AST_NODE_TYPES.TSNonNullExpression:
      case AST_NODE_TYPES.TSTypeAssertion:
      case AST_NODE_TYPES.TSSatisfiesExpression:
        current = current.expression;
        break;
      default:
        return current;
    }
  }
}

export function isGlobalMemberAccess(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Expression,
  objectName: string,
  propertyName: string
): boolean {
  const expression = unwrapExpression(node);
  return expression.type === AST_NODE_TYPES.MemberExpression
    && !expression.computed
    && expression.object.type === AST_NODE_TYPES.Identifier
    && expression.property.type === AST_NODE_TYPES.Identifier
    && isGlobalReference(sourceCode, expression.object)
    && expression.object.name === objectName
    && expression.property.name === propertyName;
}
