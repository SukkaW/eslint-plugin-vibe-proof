import { createRule } from '@/utils/create-eslint-rule';
import { unwrapExpression } from '@/utils/ast';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import { ASTUtils, TSESLint } from '@typescript-eslint/utils';

function getOutermostTransparentExpression(node: TSESTree.Identifier): TSESTree.Node {
  let current: TSESTree.Node = node;
  for (;;) {
    const { parent } = current;
    if (
      (parent.type === AST_NODE_TYPES.ChainExpression
        || parent.type === AST_NODE_TYPES.TSAsExpression
        || parent.type === AST_NODE_TYPES.TSNonNullExpression
        || parent.type === AST_NODE_TYPES.TSTypeAssertion
        || parent.type === AST_NODE_TYPES.TSSatisfiesExpression)
      && parent.expression === current
    ) {
      current = parent;
      continue;
    }
    return current;
  }
}

function isCalledIncludesReceiver(node: TSESTree.Identifier): boolean {
  const expression = getOutermostTransparentExpression(node);
  const { parent } = expression;
  return parent.type === AST_NODE_TYPES.MemberExpression
    && parent.object === expression
    && !parent.computed
    && parent.property.type === AST_NODE_TYPES.Identifier
    && parent.property.name === 'includes'
    && parent.parent.type === AST_NODE_TYPES.CallExpression
    && parent.parent.callee === parent;
}

function isDirectlyExported(variable: TSESLint.Scope.Variable): boolean {
  return variable.defs.some((definition) => {
    const declaration = definition.node.parent;
    return declaration.parent.type === AST_NODE_TYPES.ExportNamedDeclaration
      || declaration.parent.type === AST_NODE_TYPES.ExportDefaultDeclaration;
  });
}

function hasLocalVariableDefinition(variable: TSESLint.Scope.Variable): boolean {
  return variable.defs.length > 0 && variable.defs.every(
    (definition) => definition.type === TSESLint.Scope.DefinitionType.Variable
  );
}

function isOnlyUsedByIncludes(
  sourceCode: TSESLint.SourceCode,
  object: TSESTree.Expression,
  cache: WeakMap<TSESLint.Scope.Variable, boolean>
): boolean {
  const expression = unwrapExpression(object);
  if (expression.type === AST_NODE_TYPES.ArrayExpression) return true;
  if (expression.type !== AST_NODE_TYPES.Identifier) return false;

  const variable = ASTUtils.findVariable(sourceCode.getScope(expression), expression);
  if (variable == null) return false;

  const cached = cache.get(variable);
  if (cached != null) return cached;

  if (!hasLocalVariableDefinition(variable) || isDirectlyExported(variable)) {
    cache.set(variable, false);
    return false;
  }

  for (let i = 0, len = variable.references.length; i < len; i++) {
    const reference = variable.references[i];
    if (
      (reference.isWrite() && reference.init !== true)
      || (reference.isRead() && !isCalledIncludesReceiver(reference.identifier))
    ) {
      cache.set(variable, false);
      return false;
    }
  }
  cache.set(variable, true);
  return true;
}

export default createRule({
  name: 'no-constant-array-includes',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow `.includes()` on constant arrays. Use a `Set` with `.has()` for O(1) lookup instead.'
    },
    messages: {
      default: 'Do not use `.includes()` on a constant array. Use a `Set` with `.has()` instead.'
    },
    schema: []
  },
  create(context) {
    const onlyIncludesCache = new WeakMap<TSESLint.Scope.Variable, boolean>();

    return {
      'CallExpression[callee.type="MemberExpression"][callee.property.name="includes"]': (node: TSESTree.CallExpression) => {
        const callee = node.callee as TSESTree.MemberExpression;
        const staticValue = ASTUtils.getStaticValue(callee.object, context.sourceCode.getScope(callee.object));
        // length > 0: getStaticValue resolves the *initial* value and ignores mutations,
        // so `const arr = []; arr.push(x); arr.includes(y)` resolves to []. Skip empty
        // arrays since they are almost certainly populated dynamically.
        if (
          staticValue != null
          && Array.isArray(staticValue.value)
          && staticValue.value.length > 0
          && isOnlyUsedByIncludes(context.sourceCode, callee.object, onlyIncludesCache)
        ) {
          context.report({ node, messageId: 'default' });
        }
      }
    };
  }
});
