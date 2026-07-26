import { createRule } from '@/utils/create-eslint-rule';
import type { RuleContext } from '@/utils/create-eslint-rule';
import { getAllScopeRefs, resolveToArrayExpression, isUseEffectCall, findParentNode } from '@/utils/react-hooks';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';

export type MessageId = 'default' | 'noUnnecessaryUseCallbackInsideUseEffect';

// --- AST helpers ---

function isUseCallbackCall(node: TSESTree.Node): node is TSESTree.CallExpression {
  if (node.type !== AST_NODE_TYPES.CallExpression) return false;
  const { callee } = node;
  if (callee.type === AST_NODE_TYPES.Identifier) return callee.name === 'useCallback';
  if (
    callee.type === AST_NODE_TYPES.MemberExpression
    && callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return callee.property.name === 'useCallback';
  }
  return false;
}

// --- Main logic ---

function checkForUsageInsideUseEffect(
  node: TSESTree.VariableDeclarator,
  context: RuleContext<MessageId, unknown[]>
  // messageId: MessageId,
  // name: string
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

  return node.init; // return the useCallback call node to report on
}

export default createRule({
  name: 'react-no-unnecessary-use-callback',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow unnecessary \'useCallback\' calls.'
    },
    messages: {
      default:
        'A \'useCallback\' with empty deps and no references to the component scope may be unnecessary.',
      noUnnecessaryUseCallbackInsideUseEffect:
        '\'{{name}}\' is only used inside 1 useEffect. Consider moving it directly inside the useEffect.'
    },
    schema: []
  },
  create(context) {
    return {
      VariableDeclarator(node) {
        const { id, init } = node;
        if (init == null) return;
        if (!isUseCallbackCall(init)) return;

        const callNode = init;
        const [arg0, arg1] = callNode.arguments as [TSESTree.CallExpressionArgument | undefined, TSESTree.CallExpressionArgument | undefined];
        if (!arg0 || !arg1) return;

        const varName =
          id.type === AST_NODE_TYPES.Identifier ? id.name : '[unknown]';

        // Check if the callback is only used inside a single useEffect
        const useEffectReportNode = checkForUsageInsideUseEffect(
          node,
          context
          // 'noUnnecessaryUseCallbackInsideUseEffect',
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
              messageId: 'noUnnecessaryUseCallbackInsideUseEffect',
              node: useEffectReportNode,
              data: { name: varName }
            });
          }
          return;
        }

        // Empty deps: find the scope of the callback function
        // componentScope = the scope where useCallback is called (e.g. the component function)
        const componentScope = context.sourceCode.getScope(callNode);
        const arg0Scope = componentScope.childScopes.find((s) => s.block === arg0);

        if (arg0Scope == null) {
          // arg0 is an identifier reference (e.g. useCallback(cb, [])) - can't inspect body
          if (useEffectReportNode != null) {
            context.report({
              messageId: 'noUnnecessaryUseCallbackInsideUseEffect',
              node: useEffectReportNode,
              data: { name: varName }
            });
          }
          return;
        }

        // Check if any reference inside the callback resolves to the component scope
        let hasRefsToComponentScope = false;
        for (const ref of getAllScopeRefs(arg0Scope)) {
          if (componentScope.variables.some((v) => v === ref.resolved)) {
            hasRefsToComponentScope = true;
            break;
          }
        }

        if (hasRefsToComponentScope) return; // references component scope vars - callback is meaningful

        context.report({ messageId: 'default', node: callNode });
      }
    };
  }
});
