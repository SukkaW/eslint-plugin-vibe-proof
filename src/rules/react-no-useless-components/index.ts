import { createRule } from '@/utils/create-eslint-rule';
import { isNullish, walkNodes } from '@/utils/ast';
import { getNearestFunctionAncestor, isComponentName, isHookCall, isRangeInside, isWrapperComponentCall } from '@/utils/react-hooks';
import type { FunctionNode } from '@/utils/react-hooks';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import { ASTUtils } from '@typescript-eslint/utils';
import type { TSESLint } from '@typescript-eslint/utils';

interface ConstantJsxState {
  hasJsx: boolean
}

/**
 * Whether the expression is expressible as (part of) a constant JSX value:
 * a JSX element/fragment, a nullish leaf, or a ternary / logical chain over
 * those. The condition operands themselves are unrestricted — `cond ? a : b`
 * converts to a constant verbatim. If the condition is not statically
 * determinable, reading it in render is a hidden dependency that should have
 * been a prop anyway, so it does not exempt the component.
 */
function isConstantJsxExpression(expression: TSESTree.Expression, state: ConstantJsxState): boolean {
  switch (expression.type) {
    case AST_NODE_TYPES.JSXElement:
    case AST_NODE_TYPES.JSXFragment:
      state.hasJsx = true;
      return true;
    case AST_NODE_TYPES.ConditionalExpression:
      return isConstantJsxExpression(expression.consequent, state)
        && isConstantJsxExpression(expression.alternate, state);
    case AST_NODE_TYPES.LogicalExpression:
      // `cond && <jsx />` — only the right side is rendered; for `||` / `??`
      // either side may be
      return expression.operator === '&&'
        ? isConstantJsxExpression(expression.right, state)
        : (
          isConstantJsxExpression(expression.left, state)
          && isConstantJsxExpression(expression.right, state)
        );
    default:
      return isNullish(expression) !== false;
  }
}

function isConstantJsxStatements(statements: TSESTree.Statement[], state: ConstantJsxState): boolean {
  for (let i = 0, len = statements.length; i < len; i++) {
    const statement = statements[i];

    if (statement.type === AST_NODE_TYPES.ReturnStatement) {
      if (statement.argument != null && !isConstantJsxExpression(statement.argument, state)) return false;
      continue;
    }

    if (statement.type === AST_NODE_TYPES.IfStatement) {
      const consequent = statement.consequent.type === AST_NODE_TYPES.BlockStatement
        ? statement.consequent.body
        : [statement.consequent];
      if (!isConstantJsxStatements(consequent, state)) return false;

      if (statement.alternate != null) {
        const alternate = statement.alternate.type === AST_NODE_TYPES.BlockStatement
          ? statement.alternate.body
          : [statement.alternate];
        if (!isConstantJsxStatements(alternate, state)) return false;
      }
      continue;
    }

    return false;
  }
  return true;
}

/**
 * Whether the function body does nothing but (conditionally) return JSX —
 * an expression-bodied arrow, `return <jsx />` statements, ternaries,
 * logical chains, and `if`/`else` trees whose leaves are all JSX or nullish.
 * Such a body is exactly a constant JSX expression: there are no local
 * bindings and no statements with observable per-render evaluation, so
 * "assign the JSX to a constant" is semantics-preserving (an `if`/`else`
 * tree becomes a ternary).
 */
function returnsOnlyConstantJsx(node: FunctionNode): boolean {
  const state: ConstantJsxState = { hasJsx: false };
  const bodyQualifies = node.body.type === AST_NODE_TYPES.BlockStatement
    ? isConstantJsxStatements(node.body.body, state)
    : isConstantJsxExpression(node.body, state);
  return bodyQualifies && state.hasJsx;
}

function containsHookCall(node: FunctionNode, visitorKeys: TSESLint.SourceCode.VisitorKeys): boolean {
  let found = false;
  walkNodes(node, visitorKeys, (n) => {
    if (found) return false;
    if (isHookCall(n)) {
      found = true;
      return false;
    }
  });
  return found;
}

/**
 * A usage whose element can be replaced by a constant reference without
 * losing anything React consumes. Since the component takes no props, any
 * children or attributes passed to it are already silently ignored, so they
 * don't keep the component alive — except `key` and `ref`, which React
 * itself consumes at the usage site, and spreads, which may contain them.
 */
function isReplaceableJsxUsage(opening: TSESTree.JSXOpeningElement): boolean {
  return opening.attributes.every(
    (attr) => attr.type === AST_NODE_TYPES.JSXAttribute
      && (
        attr.name.type !== AST_NODE_TYPES.JSXIdentifier
        || (attr.name.name !== 'key' && attr.name.name !== 'ref')
      )
  );
}

interface Candidate {
  fnNode: FunctionNode,
  defId: TSESTree.Identifier
}

const RE_HOC_NAME = /^with[A-Z]/;

/**
 * Whether the HOC call's result leaves the module — `export default
 * memo(Comp)`, `export const M = memo(Comp)`, or `const M = memo(Comp)`
 * with `M` exported later. Then the component is effectively exported and
 * the wrapper is part of the module's API, not dead weight.
 */
function isHocResultExported(sourceCode: TSESLint.SourceCode, call: TSESTree.CallExpression): boolean {
  let node: TSESTree.Node = call;
  // walk through nested wrappers: `export default withRouter(memo(Comp))`
  // (the AST types claim `parent` is always set, but that is not reliable
  // at runtime, hence the defensive `?.` despite the lint warnings)
  while (node.parent?.type === AST_NODE_TYPES.CallExpression) node = node.parent;

  const parent = node.parent;
  if (parent == null) return false;
  if (
    parent.type === AST_NODE_TYPES.ExportDefaultDeclaration
    || parent.type === AST_NODE_TYPES.ExportNamedDeclaration
  ) {
    return true;
  }

  if (parent.type === AST_NODE_TYPES.VariableDeclarator && parent.id.type === AST_NODE_TYPES.Identifier) {
    if (parent.parent.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration) return true;

    const variable = ASTUtils.findVariable(sourceCode.getScope(parent.id), parent.id.name);
    return variable?.references.some(
      (ref) => ref.identifier.parent?.type === AST_NODE_TYPES.ExportSpecifier
        || ref.identifier.parent?.type === AST_NODE_TYPES.ExportDefaultDeclaration
    ) ?? false;
  }

  return false;
}

/**
 * The name of the HOC a call wraps a component with, or `null` when the call
 * is not recognizably a HOC. Covers `memo` / `forwardRef` (incl. `React.*`)
 * and the `withXxx` naming convention (`withRouter`, `withTheme`, ...).
 * Unrecognized calls are NOT treated as HOCs — an arbitrary function
 * (`registerComponent(Foo)`) may genuinely require a component type.
 */
function getUselessHocName(call: TSESTree.CallExpression): string | null {
  const { callee } = call;
  const name = callee.type === AST_NODE_TYPES.Identifier
    ? callee.name
    : (
      callee.type === AST_NODE_TYPES.MemberExpression && callee.property.type === AST_NODE_TYPES.Identifier
        ? callee.property.name
        : null
    );
  if (name == null) return null;
  return isWrapperComponentCall(call) || RE_HOC_NAME.test(name) ? name : null;
}

/**
 * The source text of the single expression the function body boils down to,
 * or `null` when there is no such expression (an `if`/`else` tree would have
 * to be rewritten into a ternary, which is not a mechanical fix).
 */
function getConstantJsxText(node: FunctionNode, sourceCode: TSESLint.SourceCode): string | null {
  if (node.body.type !== AST_NODE_TYPES.BlockStatement) {
    return sourceCode.getText(node.body);
  }
  const [onlyStatement] = node.body.body;
  if (
    node.body.body.length === 1
    && onlyStatement.type === AST_NODE_TYPES.ReturnStatement
    && onlyStatement.argument != null
  ) {
    return sourceCode.getText(onlyStatement.argument);
  }
  return null;
}

/**
 * Build the autofix, or `null` when the rewrite cannot be proven safe:
 *
 * - the body is an `if`/`else` tree rather than a single expression —
 *   rewriting it into a ternary is not a mechanical fix;
 * - a usage carries attributes or children — they are ignored by the
 *   component but their expressions still evaluate at element creation, so
 *   deleting them could remove side effects;
 * - the lowercased constant name is already bound at the declaration or a
 *   usage site;
 * - a usage sits lexically before the declaration at module level — a
 *   `function` declaration hoists but `const` does not, so only a usage
 *   inside a function body (evaluated on call, after module init) stays safe.
 */
function tryBuildFix(
  sourceCode: TSESLint.SourceCode,
  fnNode: FunctionNode,
  defId: TSESTree.Identifier,
  usages: TSESTree.JSXOpeningElement[]
): TSESLint.ReportFixFunction | null {
  const jsxText = getConstantJsxText(fnNode, sourceCode);
  if (jsxText == null) return null;

  const newName = defId.name.charAt(0).toLowerCase() + defId.name.slice(1);
  if (ASTUtils.findVariable(sourceCode.getScope(defId), newName) != null) return null;

  const declTarget = defId.parent.type === AST_NODE_TYPES.VariableDeclarator
    ? defId.parent
    : fnNode;

  const replacements: Array<[element: TSESTree.JSXElement, text: string]> = [];

  for (let i = 0, len = usages.length; i < len; i++) {
    const usage = usages[i];
    const usageElement = usage.parent;

    if (
      usage.attributes.length > 0
      || !usageElement.children.every(
        (child) => child.type === AST_NODE_TYPES.JSXText && child.value.trim() === ''
      )
    ) {
      return null;
    }

    if (ASTUtils.findVariable(sourceCode.getScope(usage.name), newName) != null) return null;

    if (usageElement.range[0] < declTarget.range[1] && getNearestFunctionAncestor(usageElement) == null) {
      return null;
    }

    replacements.push([
      usageElement,
      usageElement.parent.type === AST_NODE_TYPES.JSXElement || usageElement.parent.type === AST_NODE_TYPES.JSXFragment
        ? `{${newName}}`
        : newName
    ]);
  }

  return (fixer) => [
    declTarget.type === AST_NODE_TYPES.VariableDeclarator
      ? fixer.replaceText(declTarget, `${newName} = ${jsxText}`)
      : fixer.replaceText(declTarget, `const ${newName} = ${jsxText};`),
    ...replacements.map(([element, text]) => fixer.replaceText(element, text))
  ];
}

export default createRule({
  name: 'react-no-useless-components',
  meta: {
    type: 'suggestion',
    fixable: 'code',
    docs: {
      description: 'Disallow local, prop-less React components that render constant JSX. Assign the JSX to a constant variable instead.'
    },
    messages: {
      uselessComponent: 'Component "{{name}}" is not exported, takes no props, and renders constant JSX. It does not need to be a component — assign its JSX to a constant variable (`const xxx = jsx`) and reference that constant in place of `<{{name}} />`. A React element is immutable, so the same constant can be rendered any number of times.',
      uselessHocWrapper: 'Component "{{name}}" takes no props, so wrapping it in the HOC "{{hoc}}" does nothing: a HOC can only feed a component through props, which "{{name}}" never reads — and `memo` in particular only compares props, so it has nothing to memoize while constant JSX gets the same bailout for free: React skips reconciliation via reference identity. Drop the wrapper and assign the JSX to a constant variable instead.'
    },
    schema: []
  },
  create(context) {
    const candidates: Candidate[] = [];

    function collect(node: FunctionNode) {
      if (node.params.length > 0) return;
      if (!returnsOnlyConstantJsx(node)) return;

      let defId: TSESTree.Identifier | null = null;

      if (node.type === AST_NODE_TYPES.FunctionDeclaration) {
        defId = node.id;
      } else {
        let parent: TSESTree.Node = node.parent;
        // `const Foo = memo(() => <jsx />)` — look through the wrapper call
        if (
          parent.type === AST_NODE_TYPES.CallExpression
          && parent.arguments[0] === node
          && isWrapperComponentCall(parent)
        ) {
          parent = parent.parent;
        }
        if (parent.type === AST_NODE_TYPES.VariableDeclarator && parent.id.type === AST_NODE_TYPES.Identifier) {
          defId = parent.id;
        }
      }

      if (defId == null || !isComponentName(defId.name)) return;

      // Exported at the declaration site (`export function Foo` /
      // `export const Foo = ...` / `export default function Foo`). Only the
      // declaration's own wrapper counts — being declared inside an exported
      // component does not export the inner one.
      const declParent: TSESTree.Node | undefined = defId.parent.type === AST_NODE_TYPES.VariableDeclarator
        ? defId.parent.parent.parent
        : defId.parent.parent;
      if (
        declParent != null
        && (
          declParent.type === AST_NODE_TYPES.ExportNamedDeclaration
          || declParent.type === AST_NODE_TYPES.ExportDefaultDeclaration
        )
      ) {
        return;
      }

      // A component with hook calls is stateful per instance — it cannot
      // become a constant JSX value.
      if (containsHookCall(node, context.sourceCode.visitorKeys)) return;

      candidates.push({ fnNode: node, defId });
    }

    return {
      FunctionDeclaration: collect,
      FunctionExpression: collect,
      ArrowFunctionExpression: collect,
      'Program:exit': function () {
        for (let i = 0, len = candidates.length; i < len; i++) {
          const { fnNode, defId } = candidates[i];

          const variable = ASTUtils.findVariable(context.sourceCode.getScope(defId), defId.name);
          if (!variable?.defs.some((def) => def.name === defId)) continue;

          const usages: TSESTree.JSXOpeningElement[] = [];
          let mustStayComponent = false;
          let hocName: string | null = null;

          for (let j = 0, refsLen = variable.references.length; j < refsLen; j++) {
            const ref = variable.references[j];
            const id = ref.identifier;
            if (id === defId || ref.init) continue;

            // A self-reference (recursion) — cannot be a constant
            if (isRangeInside(id.range, fnNode.range)) {
              mustStayComponent = true;
              break;
            }

            const parent = id.parent;
            if (parent.type === AST_NODE_TYPES.JSXClosingElement) continue;
            if (
              parent.type === AST_NODE_TYPES.JSXOpeningElement
              && parent.name === id
              && isReplaceableJsxUsage(parent)
            ) {
              usages.push(parent);
              continue;
            }

            // Passed to a HOC (`memo(Foo)`, `withRouter(Foo)`) — for a
            // prop-less component every HOC is a no-op, reported separately.
            // Unless the wrapped result is exported: then the component
            // effectively leaves the module and must stay one.
            if (
              parent.type === AST_NODE_TYPES.CallExpression
              && id.type === AST_NODE_TYPES.Identifier
              && parent.arguments.includes(id)
            ) {
              const hoc = getUselessHocName(parent);
              if (hoc != null) {
                if (isHocResultExported(context.sourceCode, parent)) {
                  mustStayComponent = true;
                  break;
                }
                hocName = hoc;
                continue;
              }
            }

            // Anything else — `export { Foo }`, `export default Foo`,
            // passed as a value (`component={Foo}`, an unrecognized call),
            // member access, a JSX usage carrying `key`/`ref`/a spread,
            // etc. — means it has to remain a component.
            mustStayComponent = true;
            break;
          }

          if (mustStayComponent) continue;

          // A HOC wrapping takes precedence: no autofix (the wrapper's
          // result is its own component with its own usages — unwrapping it
          // is not a mechanical rewrite), but the report explains why the
          // wrapper is dead weight.
          if (hocName != null) {
            context.report({
              node: defId,
              messageId: 'uselessHocWrapper',
              data: { name: defId.name, hoc: hocName }
            });
            continue;
          }

          // At least one JSX usage: never-used components are
          // `no-unused-vars` territory. Multiple usages don't justify a
          // component either — a React element is immutable, so the same
          // constant can be rendered in several places.
          if (usages.length === 0) continue;

          context.report({
            node: defId,
            messageId: 'uselessComponent',
            data: { name: defId.name },
            fix: tryBuildFix(context.sourceCode, fnNode, defId, usages)
          });
        }
      }
    };
  }
});
