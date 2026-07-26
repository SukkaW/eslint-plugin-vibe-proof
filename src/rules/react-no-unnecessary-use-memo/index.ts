import { createRule } from '@/utils/create-eslint-rule';
import type { RuleContext } from '@/utils/create-eslint-rule';
import { getAllScopeRefs, resolveToArrayExpression, isUseEffectCall, findParentNode } from '@/utils/react-hooks';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';

export type MessageId = 'default' | 'noUnnecessaryUseMemoInsideUseEffect';

// --- AST helpers ---

function isUseMemoCall(node: TSESTree.Node): node is TSESTree.CallExpression {
  if (node.type !== AST_NODE_TYPES.CallExpression) return false;
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) return callee.name === 'useMemo';
  if (
    callee.type === AST_NODE_TYPES.MemberExpression
    && callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return callee.property.name === 'useMemo';
  }
  return false;
}

/**
 * Checks if a node (recursively) contains any CallExpression or NewExpression.
 * This is used to detect if a useMemo factory function has computation worth memoizing.
 */
function hasCallOrNew(node: TSESTree.Node): boolean {
  if (
    node.type === AST_NODE_TYPES.CallExpression
    || node.type === AST_NODE_TYPES.NewExpression
    || node.type === AST_NODE_TYPES.TaggedTemplateExpression
    || node.type === AST_NODE_TYPES.ImportExpression
  ) {
    return true;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent') continue;
    if (Array.isArray(value)) {
      if (
        value.some(
          (child): boolean => child != null
            && typeof child === 'object'
            && 'type' in child
            && hasCallOrNew(child as TSESTree.Node)
        )
      ) {
        return true;
      }
    } else if (typeof value === 'object' && value != null && 'type' in value && hasCallOrNew(value as TSESTree.Node)) return true;
  }
  return false;
}

// --- Main logic ---

function checkForUsageInsideUseEffect(
  node: TSESTree.VariableDeclarator,
  context: RuleContext<MessageId, unknown[]>
): TSESTree.Node | null {
  const declaredVariables = context.sourceCode.getDeclaredVariables(node);
  if (declaredVariables.length !== 1) return null;
  const [declaredVariable] = declaredVariables;

  const readRefs = declaredVariable.references.filter((ref) => !ref.isWrite());
  if (readRefs.length === 0) return null;

  const useEffectNodes = new Set<TSESTree.Node>();
  for (const ref of readRefs) {
    const useEffectNode = findParentNode(ref.identifier, isUseEffectCall);
    if (useEffectNode == null) return null; // used outside useEffect
    useEffectNodes.add(useEffectNode);
  }

  if (useEffectNodes.size !== 1) return null; // used in multiple useEffects

  return node.init; // return the useMemo call node to report on
}

export default createRule({
  name: 'react-no-unnecessary-use-memo',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow unnecessary \'useMemo\' calls.'
    },
    messages: {
      default:
        'A \'useMemo\' with empty deps and no references to the component scope may be unnecessary.',
      noUnnecessaryUseMemoInsideUseEffect:
        '\'{{name}}\' is only used inside 1 useEffect. Consider moving it directly inside the useEffect.'
    },
    schema: []
  },
  create(context) {
    return {
      VariableDeclarator(node) {
        const { id, init } = node;
        if (init == null) return;
        if (!isUseMemoCall(init)) return;

        const callNode = init;
        if (callNode.arguments.length < 2) return;
        const [arg0, arg1] = callNode.arguments;

        const varName =
          id.type === AST_NODE_TYPES.Identifier ? id.name : '[unknown]';

        // Check if the memoized value is only used inside a single useEffect
        const useEffectReportNode = checkForUsageInsideUseEffect(
          node,
          context
          // varName
        );

        // Resolve deps array
        const depsNode = resolveToArrayExpression(context, arg1) ?? arg1;
        const isEmptyDeps =
          depsNode.type === AST_NODE_TYPES.ArrayExpression
          && depsNode.elements.length === 0;

        if (!isEmptyDeps) {
          // Non-empty deps: only report if only used inside 1 useEffect
          if (useEffectReportNode != null) {
            context.report({
              messageId: 'noUnnecessaryUseMemoInsideUseEffect',
              node: useEffectReportNode,
              data: { name: varName }
            });
          }
          return;
        }

        // Empty deps: find the scope of the factory function
        // componentScope = the scope where useMemo is called (e.g. the component function)
        const componentScope = context.sourceCode.getScope(callNode);
        const arg0Scope = componentScope.childScopes.find((s) => s.block === arg0);

        if (arg0Scope == null) {
          // arg0 is an identifier reference - can't inspect body
          if (useEffectReportNode != null) {
            context.report({
              messageId: 'noUnnecessaryUseMemoInsideUseEffect',
              node: useEffectReportNode,
              data: { name: varName }
            });
          }
          return;
        }

        // If the factory has computation (calls/news), it might be worth memoizing
        const funcNode = arg0 as
          | TSESTree.ArrowFunctionExpression
          | TSESTree.FunctionExpression;
        if (
          (funcNode.type === AST_NODE_TYPES.ArrowFunctionExpression
            || funcNode.type === AST_NODE_TYPES.FunctionExpression)
          && hasCallOrNew(funcNode.body)
        ) {
          return; // has computation - don't flag as "default"
        }
        if (componentScope == null) return;

        // Check if any reference inside the factory resolves to the component scope
        const allRefs = [...getAllScopeRefs(arg0Scope)];
        const hasRefsToComponentScope = allRefs.some((ref) => componentScope.variables.some((v) => v === ref.resolved));

        if (hasRefsToComponentScope) return; // references component scope vars - memo is meaningful

        context.report({ messageId: 'default', node: callNode });
      }
    };
  }
});
