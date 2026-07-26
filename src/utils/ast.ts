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

/**
 * Resolve the module an identifier was imported from, or `null` when it is not
 * an import (a local declaration, a parameter, or a global).
 *
 * Resolution goes through scope analysis rather than matching the import
 * statement by name, so aliases (`import { a as b }`) and shadowing are handled
 * correctly.
 */
export function getImportSource(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node | null
): string | null {
  if (node?.type !== AST_NODE_TYPES.Identifier) return null;

  const variable = findVariable(sourceCode.getScope(node), node);
  const def = variable?.defs[0];
  if (def?.parent?.type !== AST_NODE_TYPES.ImportDeclaration) return null;

  const source = def.parent.source.value;
  return typeof source === 'string' ? source : null;
}

/**
 * The name an identifier was imported *as at the source* — the export's own
 * name, not the local binding. For `import { a as b } from 'm'`, resolving `b`
 * yields `'a'`. Returns `null` when the identifier is not a named import
 * (default and namespace imports included, since neither names an export).
 *
 * Match on this rather than on `identifier.name` when a rule cares about which
 * API is being called, so that aliasing does not hide it.
 */
export function getImportedName(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node | null
): string | null {
  if (node?.type !== AST_NODE_TYPES.Identifier) return null;

  const variable = findVariable(sourceCode.getScope(node), node);
  const def = variable?.defs[0];
  if (def?.parent?.type !== AST_NODE_TYPES.ImportDeclaration) return null;
  if (def.node.type !== AST_NODE_TYPES.ImportSpecifier) return null;

  const { imported } = def.node;
  return imported.type === AST_NODE_TYPES.Identifier ? imported.name : imported.value;
}

/**
 * Whether an identifier resolves to an import from `foxact` (any subpath).
 *
 * Rules that recommend a `foxact` API use this to avoid second-guessing an
 * equivalent hook from another library: advice like "use
 * `create-local-storage-state` instead" only applies to `foxact`'s own hook,
 * and a same-named hook from `react-use` or `usehooks-ts` is a different API
 * that the user has already solved the problem with.
 */
export function isFoxactImport(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node | null
): boolean {
  const source = getImportSource(sourceCode, node);
  return source === 'foxact' || (source?.startsWith('foxact/') ?? false);
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
