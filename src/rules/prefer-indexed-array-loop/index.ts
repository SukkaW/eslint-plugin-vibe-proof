import { createRule, ensureParserWithTypeInformation } from '@/utils/create-eslint-rule';
import { isDefinitelyIndexableArrayType } from '@/utils/type-aware';
import { walkNodes, isSimpleTarget } from '@/utils/ast';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import { ASTUtils } from '@typescript-eslint/utils';
import type { TSESLint } from '@typescript-eslint/utils';

interface ArrayEntriesCall {
  array: TSESTree.Expression,
  call: TSESTree.CallExpression,
  optional: boolean
}

function getArrayEntriesCall(node: TSESTree.Expression): ArrayEntriesCall | null {
  if (
    node.type !== AST_NODE_TYPES.CallExpression
    || node.callee.type !== AST_NODE_TYPES.MemberExpression
    || node.callee.computed
    || node.callee.property.type !== AST_NODE_TYPES.Identifier
    || node.callee.property.name !== 'entries'
  ) {
    return null;
  }

  return {
    array: node.callee.object,
    call: node,
    optional: node.optional || node.callee.optional
  };
}

interface EntriesBinding {
  kind: 'const' | 'let' | 'var',
  index: TSESTree.Identifier,
  value: TSESTree.Identifier
}

// The common `for (const [index, value] of array.entries())` shape can be
// rewritten without allocating an entry tuple on every iteration. More complex
// binding patterns are still reported, but deliberately left for the author.
function getEntriesBinding(node: TSESTree.ForOfStatement): EntriesBinding | null {
  if (
    node.left.type !== AST_NODE_TYPES.VariableDeclaration
    || (node.left.kind !== 'const' && node.left.kind !== 'let' && node.left.kind !== 'var')
    || node.left.declarations.length !== 1
  ) {
    return null;
  }

  const pattern = node.left.declarations[0].id;
  if (
    pattern.type !== AST_NODE_TYPES.ArrayPattern
    || pattern.elements.length !== 2
    || pattern.elements[0]?.type !== AST_NODE_TYPES.Identifier
    || pattern.elements[1]?.type !== AST_NODE_TYPES.Identifier
  ) {
    return null;
  }

  return {
    kind: node.left.kind,
    index: pattern.elements[0],
    value: pattern.elements[1]
  };
}

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

// Whether the loop body might change the array's length (or rebind the array,
// or any object along its member chain — `box` for `box.items`), which would
// make a cached `len` observably stale. Textual match on the array
// expression — conservative, but the fix is skipped on a hit, never misapplied.
function mayMutateArray(
  sourceCode: TSESLint.SourceCode,
  body: TSESTree.Node,
  array: TSESTree.Node
): boolean {
  const arrayText = sourceCode.getText(array);
  const writeTargets = new Set([arrayText, `${arrayText}.length`]);
  let base = array;
  while (base.type === AST_NODE_TYPES.MemberExpression) {
    base = base.object;
    writeTargets.add(sourceCode.getText(base));
  }

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
    if (
      (n.type === AST_NODE_TYPES.AssignmentExpression && writeTargets.has(sourceCode.getText(n.left)))
      || (n.type === AST_NODE_TYPES.UpdateExpression && writeTargets.has(sourceCode.getText(n.argument)))
      || (n.type === AST_NODE_TYPES.UnaryExpression && n.operator === 'delete' && writeTargets.has(sourceCode.getText(n.argument)))
    ) {
      found = true;
      return false;
    }
  });
  return found;
}

// Whether control can leave the loop body while it runs: a call or a `new`
// (it may run arbitrary code), or an `await` / `yield` (other code runs in
// between). Function bodies only run when called, so they are not walked.
function mayRunOtherCode(sourceCode: TSESLint.SourceCode, root: TSESTree.Node): boolean {
  let found = false;
  walkNodes(root, sourceCode.visitorKeys, (n) => {
    if (found || ASTUtils.isFunction(n)) return false;
    if (
      n.type === AST_NODE_TYPES.CallExpression
      || n.type === AST_NODE_TYPES.NewExpression
      || n.type === AST_NODE_TYPES.TaggedTemplateExpression
      || n.type === AST_NODE_TYPES.AwaitExpression
      || n.type === AST_NODE_TYPES.YieldExpression
    ) {
      found = true;
      return false;
    }
  });
  return found;
}

// Whether this use of the array identifier could hand the array itself to
// other code. Member access, the loop header and spreading (which copies the
// elements) cannot; anything else (passing, copying, returning, exporting)
// is assumed to.
function isAliasingUse(id: TSESTree.Identifier | TSESTree.JSXIdentifier): boolean {
  let node: TSESTree.Node = id;
  while (
    node.parent.type === AST_NODE_TYPES.TSAsExpression
    || node.parent.type === AST_NODE_TYPES.TSNonNullExpression
    || node.parent.type === AST_NODE_TYPES.TSSatisfiesExpression
    || node.parent.type === AST_NODE_TYPES.TSTypeAssertion
  ) {
    node = node.parent;
  }
  const parent = node.parent;
  switch (parent.type) {
    case AST_NODE_TYPES.MemberExpression:
    case AST_NODE_TYPES.SpreadElement:
      return false;
    case AST_NODE_TYPES.ForOfStatement:
      return parent.right !== node;
    default:
      return true;
  }
}

// `mayMutateArray` only sees mutations written in the loop body. Code the body
// calls can mutate the array too, through any other reference to it. Without
// following calls, an identifier is only trusted if no other function uses it
// and it is never passed, copied or exported; a member chain (`this.items`) is
// reachable from anything that holds its base, so it is never trusted.
function mayBeMutatedElsewhere(
  sourceCode: TSESLint.SourceCode,
  loop: TSESTree.Node,
  roots: Array<TSESTree.Node | null>,
  array: TSESTree.Node
): boolean {
  if (!roots.some(root => root != null && mayRunOtherCode(sourceCode, root))) return false;
  if (array.type !== AST_NODE_TYPES.Identifier) return true;

  const variable = ASTUtils.findVariable(sourceCode.getScope(array), array);
  if (
    variable == null
    || variable.defs.length === 0
    || variable.defs.some(def => def.parent?.parent.type === AST_NODE_TYPES.ExportNamedDeclaration)
  ) return true;

  const loopFunctionScope = sourceCode.getScope(loop).variableScope;
  return variable.references.some((ref) => {
    if (ref.isWriteOnly()) return false;
    const functionScope = ref.from.variableScope;
    // top-level code runs once and cannot be re-entered from the loop
    if (functionScope !== loopFunctionScope && functionScope.block.type !== AST_NODE_TYPES.Program) return true;
    return isAliasingUse(ref.identifier);
  });
}

export default createRule({
  name: 'prefer-indexed-array-loop',
  meta: {
    type: 'suggestion',
    fixable: 'code',
    docs: {
      description: 'Enforce indexed `for` loops with a cached length over `for...of` and array `.entries()` iteration.',
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

        const rightIsArray = isDefinitelyIndexableArrayType(
          checker,
          services.getTypeAtLocation(node.right)
        );
        const entriesCall = rightIsArray ? null : getArrayEntriesCall(node.right);
        const array = entriesCall?.array ?? node.right;
        if (
          !rightIsArray
          && !isDefinitelyIndexableArrayType(checker, services.getTypeAtLocation(array))
        ) {
          return;
        }

        const arrayText = sourceCode.getText(array);
        const entriesBinding = entriesCall == null ? null : getEntriesBinding(node);
        const indexName = ['i', 'j', 'k'].find(name => isNameFree(sourceCode, node, name));
        const canFix = isSimpleTarget(array)
          && indexName != null
          && isNameFree(sourceCode, node, 'len')
          && !mayMutateArray(sourceCode, node.body, array)
          && !mayBeMutatedElsewhere(sourceCode, node, [node.body], array)
          && (
            entriesCall == null
            || (
              entriesBinding != null
              && entriesCall.call.arguments.length === 0
              && !entriesCall.optional
            )
          );

        context.report({
          node,
          messageId: 'noForOfArray',
          fix: canFix
            ? (fixer) => {
              const header = `for (let ${indexName} = 0, len = ${arrayText}.length; ${indexName} < len; ${indexName}++) `;
              const assignment = `${sourceCode.getText(node.left)} = ${arrayText}[${indexName}]`;
              const decl = entriesBinding == null
                // a statement starting with `{` is parsed as a block
                ? (node.left.type === AST_NODE_TYPES.ObjectPattern ? `(${assignment});` : `${assignment};`)
                : `${entriesBinding.kind} ${sourceCode.getText(entriesBinding.index)} = ${indexName}, ${sourceCode.getText(entriesBinding.value)} = ${arrayText}[${indexName}];`;

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
          // a second `.length` read would want the `len` name too — fix only
          // the unambiguous single-read case
          const canFix = lengthReads.length === 1
            && lastDeclarator != null
            && isSimpleTarget(lengthRead.object)
            && isNameFree(sourceCode, node, 'len')
            && !mayMutateArray(sourceCode, node.body, lengthRead.object)
            && !mayBeMutatedElsewhere(sourceCode, node, [node.body, node.test, node.update], lengthRead.object);

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
