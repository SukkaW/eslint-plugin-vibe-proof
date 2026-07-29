import { createRule, ensureParserWithTypeInformation } from '@/utils/create-eslint-rule';
import { isDefinitelyIndexableArrayType } from '@/utils/type-aware';
import { walkNodes, isSimpleTarget } from '@/utils/ast';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import { ASTUtils } from '@typescript-eslint/utils';
import type { TSESLint } from '@typescript-eslint/utils';

function hasIdentifierNamed(
  sourceCode: TSESLint.SourceCode,
  root: TSESTree.Node,
  name: string
): boolean {
  let found = false;
  walkNodes(root, sourceCode.visitorKeys, (n) => {
    if (found) return false;
    if (n.type === AST_NODE_TYPES.Identifier && n.name === name) {
      found = true;
      return false;
    }
  });
  return found;
}

// The name is safe to introduce at `node` only if nothing in scope resolves to
// it and no identifier inside the loop spells it
function isNameFree(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node,
  name: string
): boolean {
  return ASTUtils.findVariable(sourceCode.getScope(node), name) == null
    && !hasIdentifierNamed(sourceCode, node, name);
}

const LENGTH_MUTATING_METHODS = new Set(['push', 'pop', 'shift', 'unshift', 'splice']);

// Whether the loop body might change the array's length (or rebind the array),
// which would make a cached `len` observably stale. Textual match on the array
// expression — conservative, but the fix is skipped on a hit, never misapplied.
function mayMutateArray(
  sourceCode: TSESLint.SourceCode,
  body: TSESTree.Node,
  arrayText: string
): boolean {
  let found = false;
  walkNodes(body, sourceCode.visitorKeys, (n) => {
    if (found) return false;
    if (
      n.type === AST_NODE_TYPES.CallExpression
      && n.callee.type === AST_NODE_TYPES.MemberExpression
      && !n.callee.computed
      && n.callee.property.type === AST_NODE_TYPES.Identifier
      && LENGTH_MUTATING_METHODS.has(n.callee.property.name)
      && sourceCode.getText(n.callee.object) === arrayText
    ) {
      found = true;
      return false;
    }
    if (n.type === AST_NODE_TYPES.AssignmentExpression) {
      const leftText = sourceCode.getText(n.left);
      if (leftText === arrayText || leftText === `${arrayText}.length`) {
        found = true;
        return false;
      }
    }
  });
  return found;
}

export default createRule({
  name: 'prefer-indexed-array-loop',
  meta: {
    type: 'suggestion',
    fixable: 'code',
    docs: {
      description: 'Enforce indexed `for` loops with a cached length over `for...of` when iterating arrays.',
      recommended: 'recommended',
      requiresTypeChecking: true
    },
    messages: {
      noForOfArray: 'Do not iterate an array with `for...of` — an indexed `for` loop is up to 3x faster. Use `for (let i = 0, len = arr.length; i < len; i++) { const item = arr[i]; }` (index and access once per iteration).',
      uncachedLength: 'Cache the array length in the loop initializer instead of reading `.length` on every iteration: `for (let i = 0, len = arr.length; i < len; i++)`.'
    },
    schema: []
  },
  create(context) {
    const services = context.sourceCode.parserServices;
    ensureParserWithTypeInformation(services);
    const checker = services.program.getTypeChecker();
    const { sourceCode } = context;

    return {
      ForOfStatement(node) {
        // `for await...of` awaits each element — not an indexed iteration
        if (node.await) return;

        if (!isDefinitelyIndexableArrayType(checker, services.getTypeAtLocation(node.right))) {
          return;
        }

        const arrayText = sourceCode.getText(node.right);
        const canFix = isSimpleTarget(node.right)
          && isNameFree(sourceCode, node, 'i')
          && isNameFree(sourceCode, node, 'len')
          && !mayMutateArray(sourceCode, node.body, arrayText);

        context.report({
          node,
          messageId: 'noForOfArray',
          fix: canFix
            ? (fixer) => {
              const header = `for (let i = 0, len = ${arrayText}.length; i < len; i++) `;
              const decl = `${sourceCode.getText(node.left)} = ${arrayText}[i];`;

              const replacement = node.body.type === AST_NODE_TYPES.BlockStatement
                ? `${header}{ ${decl}${sourceCode.getText(node.body).slice(1)}`
                : `${header}{ ${decl} ${sourceCode.getText(node.body)} }`;

              return fixer.replaceText(node, replacement);
            }
            : null
        });
      },
      ForStatement(node) {
        if (node.test == null) return;

        // the test expression re-evaluates on every iteration — any array
        // `.length` read inside it should be cached in the initializer
        const lengthReads: TSESTree.MemberExpression[] = [];
        walkNodes(node.test, sourceCode.visitorKeys, (n) => {
          if (ASTUtils.isFunction(n)) return false;
          if (
            n.type === AST_NODE_TYPES.MemberExpression
            && !n.computed
            && n.property.type === AST_NODE_TYPES.Identifier
            && n.property.name === 'length'
            && isDefinitelyIndexableArrayType(checker, services.getTypeAtLocation(n.object))
          ) {
            lengthReads.push(n);
          }
        });

        const init = node.init;
        const lastDeclarator = init?.type === AST_NODE_TYPES.VariableDeclaration
          && (init.kind === 'let' || init.kind === 'var')
          ? init.declarations.at(-1)
          : undefined;

        for (let i = 0, len = lengthReads.length; i < len; i++) {
          const lengthRead = lengthReads[i];
          const arrayText = sourceCode.getText(lengthRead.object);
          // a second `.length` read would want the `len` name too — fix only
          // the unambiguous single-read case
          const canFix = lengthReads.length === 1
            && lastDeclarator != null
            && isSimpleTarget(lengthRead.object)
            && isNameFree(sourceCode, node, 'len')
            && !mayMutateArray(sourceCode, node.body, arrayText);

          context.report({
            node: lengthRead,
            messageId: 'uncachedLength',
            fix: canFix
              ? (fixer) => [
                fixer.insertTextAfter(lastDeclarator, `, len = ${sourceCode.getText(lengthRead)}`),
                fixer.replaceText(lengthRead, 'len')
              ]
              : null
          });
        }
      }
    };
  }
});
