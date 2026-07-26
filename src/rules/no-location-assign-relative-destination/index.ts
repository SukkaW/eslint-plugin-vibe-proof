import { createRule, isSourceCodeWithScopeManager } from '@/utils/create-eslint-rule';
import type { SourceCodeWithScopeManager } from '@/utils/create-eslint-rule';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import { ASTUtils, TSESLint } from '@typescript-eslint/utils';
import type { TSESTree } from '@typescript-eslint/types';

export type MessageId = 'noLocationAssignRelativeDestination';

export default createRule({
  name: 'no-location-assign-relative-destination',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow `location.href =` and `location.assign()` for relative-URL navigation; use the framework\'s navigation API instead'
    },
    schema: [],
    messages: {
      noLocationAssignRelativeDestination:
        'Do not use `{{method}}` to navigate to a relative destination. '
        + 'Use your framework\'s navigation API instead '
        + '(e.g. React Router\'s `navigate()` / `useNavigate()`, or Next.js\'s `redirect()` for during any components\' render phase / `useRouter().push() for event handlers in client components` from `next/navigation`).'
    }
  },
  create(context) {
    const { sourceCode } = context;
    if (!isSourceCodeWithScopeManager(sourceCode)) {
      return {};
    }

    return {
      // location.assign(...) / location['assign'](...)
      // window.location.assign(...) / window.location['assign'](...)
      // globalThis.location.assign(...) / globalThis.location['assign'](...)
      CallExpression(node) {
        const { callee, arguments: args } = node;
        if (!isMemberExprWithNamedProperty(callee, 'assign')) return;

        const rootIdentifier = getLocationRootIdentifier(callee.object);
        if (!rootIdentifier) return;
        if (!isGlobalReference(sourceCode, rootIdentifier)) return;
        if (args.length < 1) return;

        const firstArg = args[0];
        if (firstArg.type === AST_NODE_TYPES.SpreadElement) return;

        const value = getStaticStringPrefix(firstArg, sourceCode);
        if (value !== null && isRelativeUrl(value)) {
          context.report({
            node,
            messageId: 'noLocationAssignRelativeDestination',
            data: { method: sourceCode.getText(callee) + '()' }
          });
        }
      },

      // location.href = '/path'
      // window.location.href = '/path'
      // globalThis.location.href = '/path'
      AssignmentExpression(node) {
        const { left, right } = node;
        if (!isMemberExprWithNamedProperty(left, 'href')) return;

        const rootIdentifier = getLocationRootIdentifier(left.object);
        if (!rootIdentifier) return;
        if (!isGlobalReference(sourceCode, rootIdentifier)) return;

        const value = getStaticStringPrefix(right, sourceCode);
        if (value !== null && isRelativeUrl(value)) {
          context.report({
            node,
            messageId: 'noLocationAssignRelativeDestination',
            data: { method: sourceCode.getText(left) }
          });
        }
      }
    };
  }
});

function isMemberExprWithNamedProperty(
  expr: TSESTree.Expression,
  name: string
): expr is TSESTree.MemberExpression {
  if (expr.type !== AST_NODE_TYPES.MemberExpression) return false;

  return expr.computed
    ? (
      expr.property.type === AST_NODE_TYPES.Literal
      && expr.property.value === name
    )
    : (
      expr.property.type === AST_NODE_TYPES.Identifier
      && expr.property.name === name
    );
}

const GLOBAL_PREFIXES = new Set(['window', 'globalThis', 'document', 'self']);

/**
 * If the node is `location`, `window.location`, or `globalThis.location`, returns the root
 * identifier whose binding must resolve to a global for the pattern to apply.
 * Returns null if the shape doesn't match.
 */
function getLocationRootIdentifier(node: TSESTree.Node): TSESTree.Identifier | null {
  if (node.type === AST_NODE_TYPES.Identifier && node.name === 'location') {
    return node;
  }
  if (
    node.type === AST_NODE_TYPES.MemberExpression
    && node.object.type === AST_NODE_TYPES.Identifier
    && GLOBAL_PREFIXES.has(node.object.name)
    && isMemberExprWithNamedProperty(node, 'location')
  ) {
    return node.object;
  }
  return null;
}

/**
 * Determines whether the given identifier is a reference to a global variable.
 *
 * Ported from ESLint 9.29+ `sourceCode.isGlobalReference` — @typescript-eslint/utils@8
 * does not expose the method on its `SourceCode` type yet.
 *
 * @see https://github.com/eslint/eslint/blob/2b252be80f362cca7be3326a6dbe958680fdfe9a/lib/languages/js/source-code/source-code.js#L730
 */
function isGlobalReference(
  sourceCode: SourceCodeWithScopeManager,
  node: TSESTree.Node | null
): boolean {
  if (!node) return false;
  if (node.type !== AST_NODE_TYPES.Identifier) return false;

  const variable = sourceCode.scopeManager.scopes[0].set.get(node.name);

  if (!variable || variable.defs.length > 0) return false;

  return variable.references.some(({ identifier }) => identifier === node);
}

// Matches absolute URLs: scheme: or protocol-relative //
const ABSOLUTE_URL_RE = /^(?:[a-z][\d+.a-z-]*:|\/\/)/i;
function isRelativeUrl(value: string): boolean {
  return !ABSOLUTE_URL_RE.test(value);
}

/**
 * Extracts the leading static string from a node.
 * Uses getStringIfConstant to resolve literals and constant variable references.
 * For template literals with expressions, falls back to the static prefix of the first quasi.
 * Returns null when the value cannot be statically determined.
 */
function findLastWriteExprBefore(
  variable: TSESLint.Scope.Variable,
  def: TSESLint.Scope.Definition,
  readPos: number
): TSESTree.ConstDeclaration | TSESTree.LetOrVarDeclaredDeclaration | TSESTree.LetOrVarNonDeclaredDeclaration | TSESTree.Expression | null {
  let lastWriteExpr: TSESTree.ConstDeclaration | TSESTree.LetOrVarDeclaredDeclaration | TSESTree.LetOrVarNonDeclaredDeclaration | TSESTree.Expression | null = null;
  if ('init' in def.node) lastWriteExpr = def.node.init;

  for (const ref of variable.references) {
    if (ref.identifier.range[0] >= readPos) return lastWriteExpr;
    if (ref.isWrite() && ref.writeExpr && 'init' in def.node && ref.writeExpr !== def.node.init) {
      lastWriteExpr = ref.writeExpr as TSESTree.Expression;
    }
  }
  return lastWriteExpr;
}

function getStaticStringPrefix(node: TSESTree.Expression, sourceCode: TSESLint.SourceCode): string | null {
  let current: TSESTree.ConstDeclaration | TSESTree.LetOrVarDeclaredDeclaration | TSESTree.LetOrVarNonDeclaredDeclaration | TSESTree.Expression = node;
  for (;;) {
    const constantValue = ASTUtils.getStringIfConstant(current, sourceCode.getScope(current));
    if (constantValue !== null) {
      return constantValue;
    }

    if (current.type === AST_NODE_TYPES.TemplateLiteral && current.quasis.length > 0) {
      return current.quasis[0].value.cooked ?? current.quasis[0].value.raw;
    }

    if (
      current.type === AST_NODE_TYPES.BinaryExpression
      && current.operator === '+'
    ) {
      current = current.left;
      continue;
    }

    if (current.type === AST_NODE_TYPES.Identifier) {
      const variable = ASTUtils.findVariable(sourceCode.getScope(current), current);
      if (!variable || variable.defs.length < 1) return null;

      const def = variable.defs[variable.defs.length - 1];
      if (def.type !== TSESLint.Scope.DefinitionType.Variable) return null;

      const readPos = current.range[0];
      const lastWriteExpr = findLastWriteExprBefore(variable, def, readPos);

      if (!lastWriteExpr) return null;
      current = lastWriteExpr;
      continue;
    }

    return null;
  }
}
