import { createRule } from '@/utils/create-eslint-rule';
import type { RuleContext } from '@/utils/create-eslint-rule';
import { isUseEffectCall, isSetStateCallee } from '@/utils/react-hooks';
import type { FunctionNode } from '@/utils/react-hooks';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import { TSESLint, ASTUtils } from '@typescript-eslint/utils';

const WATCH_MESSAGE = 'Do not call the set function of useState synchronously in an effect. Respond directly at where the change happens (the setState call site), or utilize event handlers/callbacks (like onSuccess, onError, onChange, etc.) provided by libraries. If it is a purely derived value, compute it within the render phase w/ `useMemo` (ensure single source of truth) instead of having separate states.';
const WATCH_WITH_PROPS_MESSAGE = `${WATCH_MESSAGE} If this needs to reset state from outside, always prefer \`key\` to force-reset a component state, or use \`foxact/use-component-will-receive-update\` as your last resort to change internal state based on props change.`;

type FunctionKind =
  | 'setup'
  | 'deferred'
  | 'immediate'
  | 'other';

function getFunctionKind(node: FunctionNode): FunctionKind {
  // async function body — any setState inside is deferred
  if (node.async) return 'deferred';

  const parent = node.parent;

  // useEffect(() => { ... })
  if (
    parent.type === AST_NODE_TYPES.CallExpression
    && parent.arguments[0] === node
    && isUseEffectCall(parent)
  ) {
    return 'setup';
  }

  // IIFE: (() => { ... })() or (function() { ... })()
  if (
    parent.type === AST_NODE_TYPES.CallExpression
    && parent.callee === node
  ) {
    return 'immediate';
  }

  // A named function declaration is only synchronous if it is actually called
  // from a synchronous context — treat it as 'other' so its setState calls are
  // deferred and reported only when a synchronous call site is observed. (A
  // helper invoked solely from a deferred continuation, e.g. after `await`, is
  // not a synchronous watch.)
  if (node.type === AST_NODE_TYPES.FunctionDeclaration) {
    return 'other';
  }

  if (parent.type === AST_NODE_TYPES.CallExpression && parent.arguments.includes(node)) {
    const { callee } = parent;

    // setTimeout / setInterval / queueMicrotask / requestAnimationFrame / requestIdleCallback
    if (
      callee.type === AST_NODE_TYPES.Identifier
      && (callee.name === 'setTimeout'
        || callee.name === 'setInterval'
        || callee.name === 'queueMicrotask'
        || callee.name === 'requestAnimationFrame'
        || callee.name === 'requestIdleCallback')
    ) {
      return 'deferred';
    }

    // .then() / .catch() / .finally() / .addEventListener()
    if (
      callee.type === AST_NODE_TYPES.MemberExpression
      && callee.property.type === AST_NODE_TYPES.Identifier
      && (callee.property.name === 'then'
        || callee.property.name === 'catch'
        || callee.property.name === 'finally'
        || callee.property.name === 'addEventListener')
    ) {
      return 'deferred';
    }
  }

  return 'other';
}

function resolveFunctionNode(
  context: RuleContext<string, unknown[]>,
  node: TSESTree.Node
): FunctionNode | null {
  if (node.type !== AST_NODE_TYPES.Identifier) return null;

  const variable = ASTUtils.findVariable(context.sourceCode.getScope(node), node.name);
  if (variable == null) return null;

  const def = variable.defs.at(0);
  if (def == null) return null;

  if (def.type === TSESLint.Scope.DefinitionType.FunctionName) {
    return def.node as FunctionNode;
  }

  if (def.type === TSESLint.Scope.DefinitionType.Variable) {
    const init = def.node.init;
    if (init != null && ASTUtils.isFunction(init)) {
      return init;
    }
  }

  return null;
}

function hasPropDependency(
  effectNode: TSESTree.CallExpression
): boolean {
  if (effectNode.arguments.length < 2) return false;
  const depsArg = effectNode.arguments[1];
  if (depsArg.type !== AST_NODE_TYPES.ArrayExpression) return false;

  // Find the enclosing component/hook function
  let enclosingFunction: FunctionNode | null = null;
  let current: TSESTree.Node | undefined = effectNode.parent;
  while (current != null) {
    if (ASTUtils.isFunction(current)) {
      enclosingFunction = current;
      break;
    }
    current = current.parent;
  }
  if (enclosingFunction == null || enclosingFunction.params.length === 0) return false;

  // Collect all parameter variables
  const paramVariables = new Set<string>();
  for (const param of enclosingFunction.params) {
    collectParamNames(param, paramVariables);
  }
  if (paramVariables.size === 0) return false;

  // Check if any dep references a param
  for (const element of depsArg.elements) {
    if (element == null || element.type === AST_NODE_TYPES.SpreadElement) continue;
    const rootName = getRootIdentifierName(element);
    if (rootName != null && paramVariables.has(rootName)) return true;
  }

  return false;
}

function collectParamNames(node: TSESTree.Node, names: Set<string>): void {
  switch (node.type) {
    case AST_NODE_TYPES.Identifier:
      names.add(node.name);
      break;
    case AST_NODE_TYPES.RestElement:
      collectParamNames(node.argument, names);
      break;
    case AST_NODE_TYPES.AssignmentPattern:
      collectParamNames(node.left, names);
      break;
    case AST_NODE_TYPES.ArrayPattern:
      for (const el of node.elements) {
        if (el != null) collectParamNames(el, names);
      }
      break;
    case AST_NODE_TYPES.ObjectPattern:
      for (const prop of node.properties) {
        if (prop.type === AST_NODE_TYPES.Property) {
          collectParamNames(prop.value, names);
        } else {
          collectParamNames(prop.argument, names);
        }
      }
      break;
    default:
      break;
  }
}

function getRootIdentifierName(node: TSESTree.Node): string | null {
  let current = node;
  while (true) {
    switch (current.type) {
      case AST_NODE_TYPES.Identifier:
        return current.name;
      case AST_NODE_TYPES.MemberExpression:
        current = current.object;
        break;
      case AST_NODE_TYPES.ChainExpression:
      case AST_NODE_TYPES.TSAsExpression:
      case AST_NODE_TYPES.TSNonNullExpression:
      case AST_NODE_TYPES.TSTypeAssertion:
      case AST_NODE_TYPES.TSSatisfiesExpression:
        current = current.expression;
        break;
      default:
        return null;
    }
  }
}

function findEnclosingEffectCall(node: TSESTree.Node): TSESTree.CallExpression | null {
  let current: TSESTree.Node | undefined = node.parent;
  while (current != null) {
    if (current.type === AST_NODE_TYPES.CallExpression && isUseEffectCall(current)) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

export default createRule({
  name: 'react-no-use-effect-watching',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow calling the set function of useState synchronously in an effect.'
    },
    messages: {
      watchState: WATCH_MESSAGE,
      watchStateWithProps: WATCH_WITH_PROPS_MESSAGE
    },
    schema: []
  },
  create(context) {
    const functionStack: Array<{ node: FunctionNode, kind: FunctionKind }> = [];
    let setupFunction: FunctionNode | null = null;

    // setState calls found inside 'other'-kind functions, keyed by the function node
    const deferredSetStateCalls = new WeakMap<FunctionNode, TSESTree.CallExpression[]>();
    // Functions called directly from a synchronous context within setup
    const calledFromSetup = new Set<FunctionNode>();

    function onFunctionEnter(node: FunctionNode) {
      const kind = getFunctionKind(node);
      functionStack.push({ node, kind });
      if (kind === 'setup') {
        setupFunction = node;
      }
    }

    function onFunctionExit(node: FunctionNode) {
      const entry = functionStack.at(-1);
      if (setupFunction === node && entry?.kind === 'setup') {
        setupFunction = null;
      }
      functionStack.pop();
    }

    function isSynchronousContext(): boolean {
      for (let i = functionStack.length - 1; i >= 0; i--) {
        const { kind } = functionStack[i];
        if (kind === 'setup') return true;
        if (kind !== 'immediate') return false;
      }
      return false;
    }

    return {
      FunctionDeclaration: onFunctionEnter,
      FunctionExpression: onFunctionEnter,
      ArrowFunctionExpression: onFunctionEnter,
      'FunctionDeclaration:exit': onFunctionExit,
      'FunctionExpression:exit': onFunctionExit,
      'ArrowFunctionExpression:exit': onFunctionExit,

      CallExpression(node) {
        if (setupFunction == null) return;

        // Track direct calls to local functions from synchronous context: cb()
        if (
          node.callee.type === AST_NODE_TYPES.Identifier
          && isSynchronousContext()
        ) {
          const resolved = resolveFunctionNode(context, node.callee);
          if (resolved != null) {
            calledFromSetup.add(resolved);
          }
        }

        if (!isSetStateCallee(context.sourceCode, node.callee)) return;

        const entry = functionStack.at(-1);
        if (entry == null) return;

        if (isSynchronousContext()) {
          const effectCall = findEnclosingEffectCall(node);
          if (effectCall == null) return;

          context.report({
            node,
            messageId: hasPropDependency(effectCall)
              ? 'watchStateWithProps'
              : 'watchState'
          });
          return;
        }

        // Collect setState in 'other' functions for deferred resolution
        if (entry.kind === 'other') {
          let calls = deferredSetStateCalls.get(entry.node);
          if (calls == null) {
            calls = [];
            deferredSetStateCalls.set(entry.node, calls);
          }
          calls.push(node);
        }
      },

      'Program:exit': () => {
        for (const fnNode of calledFromSetup) {
          const calls = deferredSetStateCalls.get(fnNode);
          if (calls == null) continue;

          for (const setStateCall of calls) {
            const effectCall = findEnclosingEffectCall(setStateCall);
            if (effectCall == null) continue;

            context.report({
              node: setStateCall,
              messageId: hasPropDependency(effectCall)
                ? 'watchStateWithProps'
                : 'watchState'
            });
          }
        }
      }
    };
  }
});
