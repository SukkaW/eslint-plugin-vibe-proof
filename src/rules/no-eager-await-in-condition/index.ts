import { createRule } from '@/utils/create-eslint-rule';
import { walkNodes, unwrapExpression } from '@/utils/ast';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import { ASTUtils, TSESLint } from '@typescript-eslint/utils';
import { findVariable } from '@typescript-eslint/utils/ast-utils';
import { getTypeAware, isDefinitelyDataPropertyAccess } from '@/utils/type-aware';
import type { TypeAware } from '@/utils/type-aware';

/**
 * Flatten a left-associative `&&` (or `||`) chain into its operands.
 *
 * `a && b && c` parses as `(a && b) && c`, so the operand that runs *first* is
 * the deepest on the left. Reasoning about "which operand comes before which"
 * needs the flat list, not the tree.
 */
function flattenLogicalChain(
  node: TSESTree.LogicalExpression,
  operator: '&&' | '||'
): TSESTree.Expression[] {
  const operands: TSESTree.Expression[] = [];
  const visit = (expression: TSESTree.Expression): void => {
    if (
      expression.type === AST_NODE_TYPES.LogicalExpression
      && expression.operator === operator
    ) {
      visit(expression.left);
      visit(expression.right);
      return;
    }
    operands.push(expression);
  };
  visit(node);
  return operands;
}

function containsAwait(
  node: TSESTree.Node,
  visitorKeys: TSESLint.SourceCode.VisitorKeys
): boolean {
  let found = false;
  walkNodes(node, visitorKeys, (current) => {
    if (found) return false;
    // A nested function body has its own `await` semantics — an `await` in
    // there does not run as part of evaluating this operand.
    if (
      current !== node
      && (current.type === AST_NODE_TYPES.FunctionExpression
        || current.type === AST_NODE_TYPES.FunctionDeclaration
        || current.type === AST_NODE_TYPES.ArrowFunctionExpression)
    ) {
      return false;
    }
    if (current.type === AST_NODE_TYPES.AwaitExpression) {
      found = true;
      return false;
    }
  });
  return found;
}

/**
 * Whether an operand is cheap enough that testing it before an `await` is a
 * clear win: no calls, no `await`, no assignments, no side effects at all.
 *
 * `hasSideEffect` rejects calls, `await`, assignments and update expressions,
 * and `considerGetters` additionally rejects every property read — syntax alone
 * cannot tell whether `obj.x` is a field or a getter that does real work, and
 * hoisting a getter ahead of the `await` would fire it earlier (or, when the
 * await short-circuits first, fire it at all).
 *
 * With typed linting on, `typeAware` lets us check instead of assume: a
 * provably plain data property is the cheap read it looks like, so `user.id`
 * becomes reportable while `obj.someGetter` stays suppressed. Without type
 * information every property read stays suppressed, as before.
 *
 * `considerImplicitTypeConversion` is deliberately NOT set. It would reject
 * `!x` and `x == 1`; the coercion can only run user code through a `valueOf` /
 * `toString` on an object, and both operands are kept by the reorder, so any
 * such call still happens either way.
 */
function isCheapOperand(
  node: TSESTree.Expression,
  sourceCode: Readonly<TSESLint.SourceCode>,
  typeAware: TypeAware | null,
  visitorKeys: TSESLint.SourceCode.VisitorKeys
): boolean {
  if (!ASTUtils.hasSideEffect(node, sourceCode, { considerGetters: true })) {
    return true;
  }
  // The only verdict type information can overturn is "this might be a getter".
  // Anything else `hasSideEffect` flags (a call, an assignment, an `await`) is
  // genuinely not cheap, so re-check without `considerGetters` first.
  if (typeAware == null) return false;
  if (ASTUtils.hasSideEffect(node, sourceCode)) return false;

  return everyPropertyAccessIsPlainData(node, typeAware, visitorKeys);
}

/**
 * Whether every property read inside an expression provably touches a plain
 * data property. Computed access (`obj[key]`) is never provable this way, since
 * the key is not statically known.
 */
function everyPropertyAccessIsPlainData(
  root: TSESTree.Node,
  typeAware: TypeAware,
  visitorKeys: TSESLint.SourceCode.VisitorKeys
): boolean {
  let allPlain = true;
  walkNodes(root, visitorKeys, (current) => {
    if (!allPlain) return false;
    if (current.type !== AST_NODE_TYPES.MemberExpression) return;

    // `a?.b` still reads `b` when `a` is present, so it needs the same proof.
    if (current.computed || current.property.type !== AST_NODE_TYPES.Identifier) {
      allPlain = false;
      return false;
    }
    if (!isDefinitelyDataPropertyAccess(typeAware, current.object, current.property.name)) {
      allPlain = false;
      return false;
    }
  });
  return allPlain;
}

/**
 * Expression forms that bind *looser* than `&&` / `||`, so an operand of one of
 * these types needs parentheses to survive being moved within a logical chain.
 *
 * Without them `await g() && (a ? b : c)` would be rebuilt as
 * `a ? b : c && await g()` — which reparses as `a ? b : (c && await g())` and
 * silently changes what the condition means.
 */
const LOOSER_THAN_LOGICAL = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.AssignmentExpression,
  AST_NODE_TYPES.ArrowFunctionExpression,
  AST_NODE_TYPES.FunctionExpression,
  AST_NODE_TYPES.SequenceExpression,
  AST_NODE_TYPES.YieldExpression,
  AST_NODE_TYPES.TSAsExpression,
  AST_NODE_TYPES.TSSatisfiesExpression
]);

/**
 * The source text of an operand, parenthesized when its own precedence would
 * let the surrounding chain re-associate around it.
 */
function operandText(
  operand: TSESTree.Expression,
  operator: '&&' | '||',
  sourceCode: Readonly<TSESLint.SourceCode>
): string {
  const text = sourceCode.getText(operand);
  // `getText` returns the operand without any parentheses that wrap it, so a
  // form that needs them must always have them re-added here — checking
  // whether the source had them would drop them on the way out.
  if (LOOSER_THAN_LOGICAL.has(operand.type)) return `(${text})`;
  // A mixed logical chain (`&&` inside `||`, or `??` either way) also needs
  // them: `??` cannot be combined with `&&`/`||` unparenthesized at all.
  if (
    operand.type === AST_NODE_TYPES.LogicalExpression
    && operand.operator !== operator
  ) {
    return `(${text})`;
  }
  return text;
}

/** Every identifier name referenced anywhere inside a node. */
function collectReferencedNames(
  node: TSESTree.Node,
  visitorKeys: TSESLint.SourceCode.VisitorKeys
): Set<string> {
  const names = new Set<string>();
  walkNodes(node, visitorKeys, (current) => {
    if (current.type === AST_NODE_TYPES.Identifier) {
      names.add(current.name);
    }
  });
  return names;
}

/**
 * Whether every definition of a variable binds it as a plain identifier, rather
 * than through a destructuring pattern.
 */
function isPlainIdentifierBinding(variable: TSESLint.Scope.Variable): boolean {
  for (let i = 0, len = variable.defs.length; i < len; i++) {
    const { name } = variable.defs[i];
    if (name.parent.type !== AST_NODE_TYPES.VariableDeclarator) return false;
    if (name.parent.id.type !== AST_NODE_TYPES.Identifier) return false;
  }
  return variable.defs.length > 0;
}

/**
 * Whether a variable is read anywhere outside the given ranges.
 *
 * An awaited flag that is only read by the condition and the branch it guards
 * can have its `await` pushed inside that branch; one read anywhere else (after
 * the `if`, in an `else`) cannot, because the binding would no longer be in
 * scope there.
 */
function hasReferenceOutside(
  variable: TSESLint.Scope.Variable,
  ranges: ReadonlyArray<readonly [number, number]>
): boolean {
  for (let i = 0, len = variable.references.length; i < len; i++) {
    const { identifier, init } = variable.references[i];
    if (init) continue;
    const [start, end] = identifier.range;
    let contained = false;
    for (let j = 0, rangesLen = ranges.length; j < rangesLen; j++) {
      const range = ranges[j];
      if (start >= range[0] && end <= range[1]) {
        contained = true;
        break;
      }
    }
    if (!contained) return true;
  }
  return false;
}

export default createRule({
  name: 'no-eager-await-in-condition',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow awaiting inside a condition before a cheap synchronous operand that can short-circuit it.',
      recommended: 'recommended'
    },
    fixable: 'code',
    messages: {
      eagerAwaitInCondition: 'This `await` runs before the cheap check `{{cheap}}`, which can short-circuit the condition on its own. Test `{{cheap}}` first so the await only happens when it is needed.',
      eagerAwaitedFlag: '`{{name}}` is awaited before the cheap check `{{cheap}}`, which can short-circuit the condition on its own. Move the `await` inside the branch so it only happens when `{{cheap}}` passes.'
    },
    schema: []
  },
  create(context) {
    const { sourceCode } = context;
    const { visitorKeys } = sourceCode;
    // `null` when typed linting is off — the rule then keeps its purely
    // syntactic (more conservative) notion of a cheap operand.
    const typeAware = getTypeAware(sourceCode);

    /**
     * Report the first `await` operand that a later cheap operand could have
     * short-circuited, and hoist that cheap operand in front of it.
     *
     * The cheap operand may be moved past intervening operands even when those
     * have side effects: only the *moved* operand's purity matters. It performs
     * no work and observes nothing, so evaluating it earlier is unobservable,
     * and every operand it jumps over keeps its relative order with the rest.
     *
     * `a && other() && cheap` therefore becomes `cheap && a && other()` —
     * `other()` still runs after `a` and before nothing new.
     */
    function checkLogicalChain(node: TSESTree.LogicalExpression, operator: '&&' | '||') {
      const operands = flattenLogicalChain(node, operator);

      for (let i = 0, len = operands.length; i < len - 1; i++) {
        const awaitOperand = operands[i];
        if (!containsAwait(awaitOperand, visitorKeys)) continue;

        // The first cheap operand after the await is the one that should have
        // gone first; hoisting the earliest keeps the rewrite minimal.
        for (let j = i + 1; j < len; j++) {
          const cheap = operands[j];
          if (!isCheapOperand(cheap, sourceCode, typeAware, visitorKeys)) continue;

          const cheapText = sourceCode.getText(cheap);
          // Rebuild the chain with the cheap operand pulled to the front of the
          // awaited one, every other operand keeping its order. Rewriting the
          // whole chain in one replacement avoids overlapping fix ranges.
          const reordered = [
            ...operands.slice(0, i),
            cheap,
            ...operands.slice(i, j),
            ...operands.slice(j + 1)
          ];

          context.report({
            node: awaitOperand,
            messageId: 'eagerAwaitInCondition',
            data: { cheap: cheapText },
            fix: (fixer) => fixer.replaceText(
              node,
              reordered
                .map((operand) => operandText(operand, operator, sourceCode))
                .join(` ${operator} `)
            )
          });
          return;
        }
      }
    }

    return {
      LogicalExpression(node) {
        // Only the outermost node of a chain is handled; inner nodes of the
        // same operator are its operands, already covered by the flat list.
        if (
          node.parent.type === AST_NODE_TYPES.LogicalExpression
          && node.parent.operator === node.operator
        ) {
          return;
        }
        if (node.operator !== '&&' && node.operator !== '||') return;
        checkLogicalChain(node, node.operator);
      },

      IfStatement(node) {
        // `const flag = await getFlag(); if (flag && cheap) {}`
        // The await is bound to a name, so the fix is to move the declaration
        // inside the branch rather than to swap operands — a statement move we
        // do not perform automatically.
        const test = unwrapExpression(node.test);
        if (
          test.type !== AST_NODE_TYPES.LogicalExpression
          || test.operator !== '&&'
        ) {
          return;
        }

        const operands = flattenLogicalChain(test, '&&');
        if (operands.length < 2) return;

        const first = unwrapExpression(operands[0]);
        if (first.type !== AST_NODE_TYPES.Identifier) return;

        // The remaining operands must all be cheap, or the reorder is not a
        // clear win.
        const laterOperands = operands.slice(1);
        if (!laterOperands.every((operand) => isCheapOperand(operand, sourceCode, typeAware, visitorKeys))) return;

        const variable = findVariable(sourceCode.getScope(first), first.name);
        // A destructured binding spreads the awaited value across several
        // names, so "is this binding the awaited value" stops being a single
        // question — leave those alone.
        if (variable != null && !isPlainIdentifierBinding(variable)) return;
        const definition = variable?.defs[0];
        if (definition?.type !== TSESLint.Scope.DefinitionType.Variable) return;

        const declarator = definition.node;
        if (declarator.init == null) return;

        const declaration = declarator.parent;
        // `using` / `await using` tie disposal to the enclosing scope; moving
        // the declaration would change when the resource is released.
        if (declaration.kind !== 'const' && declaration.kind !== 'let') return;

        // The init must be exactly `await <expr>` — an await buried in a larger
        // expression may be there for reasons the shape does not show.
        const init = unwrapExpression(declarator.init);
        if (init.type !== AST_NODE_TYPES.AwaitExpression) return;

        // The declaration has to be the statement immediately before the `if`,
        // in the same block. Anything in between would be reordered relative to
        // the await.
        const block = declaration.parent;
        if (
          block.type !== AST_NODE_TYPES.BlockStatement
          && block.type !== AST_NODE_TYPES.Program
          && block.type !== AST_NODE_TYPES.StaticBlock
        ) {
          return;
        }
        const statements = block.body;
        const declarationIndex = statements.indexOf(declaration);
        if (declarationIndex === -1 || statements[declarationIndex + 1] !== node) return;

        // One declarator only: splitting a multi-declarator statement is a
        // bigger rewrite than this rule should imply.
        if (declaration.declarations.length !== 1) return;

        // The flag must not be read outside the condition and the branch it
        // guards — moving the await inside that branch would take the binding
        // out of scope for any other read, the `else` branch included.
        if (variable == null) return;
        if (hasReferenceOutside(variable, [test.range, node.consequent.range])) return;

        // The cheap operands must not depend on the flag itself.
        const flagName = first.name;
        for (let i = 0, len = laterOperands.length; i < len; i++) {
          if (collectReferencedNames(laterOperands[i], visitorKeys).has(flagName)) return;
        }

        context.report({
          node: declarator,
          messageId: 'eagerAwaitedFlag',
          data: {
            name: flagName,
            cheap: laterOperands.map((operand) => sourceCode.getText(operand)).join(' && ')
          }
        });
      }
    };
  }
});
