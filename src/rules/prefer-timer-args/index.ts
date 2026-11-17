import { createRule } from '@/utils/create-eslint-rule';
import { getTextWithParens, isGlobalReference, isNullish, walkNodes } from '@/utils/ast';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import { ASTUtils } from '@typescript-eslint/utils';
import type { TSESLint } from '@typescript-eslint/utils';

const TIMER_NAMES = new Set(['setTimeout', 'setInterval']);
const TIMER_GLOBALS = new Set(['window', 'globalThis']);

function isTimerCall(
  node: TSESTree.CallExpression,
  sourceCode: Readonly<TSESLint.SourceCode>
): boolean {
  const callee = node.callee;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return TIMER_NAMES.has(callee.name) && isGlobalReference(sourceCode, callee);
  }
  if (
    callee.type !== AST_NODE_TYPES.MemberExpression
    || callee.object.type !== AST_NODE_TYPES.Identifier
    || !TIMER_GLOBALS.has(callee.object.name)
    || !isGlobalReference(sourceCode, callee.object)
  ) {
    return false;
  }
  const propertyName = ASTUtils.getPropertyName(callee, sourceCode.getScope(callee));
  return propertyName != null && TIMER_NAMES.has(propertyName);
}

function isSafeArgument(
  arg: TSESTree.CallExpressionArgument,
  sourceCode: Readonly<TSESLint.SourceCode>
): boolean {
  if (arg.type === AST_NODE_TYPES.SpreadElement) {
    return arg.argument.type === AST_NODE_TYPES.Identifier
      && !ASTUtils.hasSideEffect(arg.argument, sourceCode);
  }
  if (ASTUtils.hasSideEffect(arg, sourceCode)) return false;

  let hasThis = false;
  walkNodes(arg, sourceCode.visitorKeys, node => {
    if (node.type !== AST_NODE_TYPES.ThisExpression) return;
    hasThis = true;
    return false;
  });
  return !hasThis;
}

function isReassigned(ref: TSESLint.Scope.Reference): boolean {
  let references = ref.resolved?.references;
  if (references == null) {
    // An unresolved name is a global; every assignment to it ends up in the
    // outermost scope's `through`
    let scope = ref.from;
    while (scope.upper != null) scope = scope.upper;
    references = scope.through.filter(r => r.identifier.name === ref.identifier.name);
  }
  return references.some(r => r.isWrite() && !r.init);
}

// The arrow evaluates its callee and arguments when the timer fires, the fix
// evaluates them when it is registered. Only allow what cannot change in
// between: no spread (it iterates its operand), no property read, and no
// variable that is ever reassigned.
function isStableUntilFired(
  arrow: TSESTree.ArrowFunctionExpression,
  call: TSESTree.CallExpression,
  sourceCode: Readonly<TSESLint.SourceCode>
): boolean {
  if (
    call.arguments.some(arg => arg.type === AST_NODE_TYPES.SpreadElement)
    || sourceCode.getScope(arrow).through.some(isReassigned)
  ) return false;

  let readsProperty = false;
  walkNodes(call, sourceCode.visitorKeys, node => {
    if (node.type !== AST_NODE_TYPES.MemberExpression) return;
    readsProperty = true;
    return false;
  });
  return !readsProperty;
}

export default createRule({
  name: 'prefer-timer-args',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer passing function and arguments directly to setTimeout/setInterval instead of wrapping in an arrow function or using bind',
      recommended: 'recommended'
    },
    fixable: 'code',
    schema: [],
    messages: {
      preferArgs:
        'Pass function and arguments directly to timer function to avoid allocating an extra function'
    }
  },
  create(context) {
    const sourceCode = context.sourceCode;

    return {
      CallExpression(node) {
        if (!isTimerCall(node, sourceCode) || (node.arguments.length < 2)) {
          return;
        }

        const firstArg = node.arguments[0];
        if (firstArg.type === AST_NODE_TYPES.SpreadElement) {
          return;
        }

        const delayText = getTextWithParens(sourceCode, node.arguments[1]);
        const timerCall = sourceCode.getText(node.callee);

        let replacement: string | null = null;

        // simple arrow functions, e.g. () => fn(args)
        if (firstArg.type === AST_NODE_TYPES.ArrowFunctionExpression) {
          // skip if it is a block body
          if (firstArg.body.type === AST_NODE_TYPES.BlockStatement) {
            return;
          }

          // skip if it has parameters
          if (firstArg.params.length > 0) {
            return;
          }

          if (firstArg.body.type !== AST_NODE_TYPES.CallExpression) {
            return;
          }

          const callee = firstArg.body.callee;
          if (callee.type !== AST_NODE_TYPES.Identifier) {
            return;
          }

          const callArgs = firstArg.body.arguments;
          if (
            !callArgs.every(arg => isSafeArgument(arg, sourceCode))
            || !isStableUntilFired(firstArg, firstArg.body, sourceCode)
          ) {
            return;
          }

          const calleeText = sourceCode.getText(callee);

          if (callArgs.length === 0) {
            replacement = `${timerCall}(${calleeText}, ${delayText})`;
          } else {
            const argsTexts = callArgs.map((arg) => getTextWithParens(sourceCode, arg));
            replacement = `${timerCall}(${calleeText}, ${delayText}, ${argsTexts.join(', ')})`;
          }
        } else if (firstArg.type === AST_NODE_TYPES.CallExpression) {
          // fn.bind(null/undefined, args)
          const bindCall = firstArg;

          if (
            bindCall.callee.type !== AST_NODE_TYPES.MemberExpression
            || ASTUtils.getPropertyName(
              bindCall.callee,
              sourceCode.getScope(bindCall.callee)
            ) !== 'bind'
            || bindCall.arguments.length === 0
          ) {
            return;
          }

          const bindContext = bindCall.arguments[0];
          if ((bindContext.type === AST_NODE_TYPES.SpreadElement) || (isNullish(bindContext) === false)) {
            return;
          }

          const fnText = getTextWithParens(sourceCode, bindCall.callee.object);
          const bindArgs = bindCall.arguments.slice(1);

          // Check if any bind argument contains a call expression or other unsafe construct
          if (!bindArgs.every(arg => isSafeArgument(arg, sourceCode))) {
            return;
          }

          if (bindArgs.length === 0) {
            replacement = `${timerCall}(${fnText}, ${delayText})`;
          } else {
            const argsTexts = bindArgs.map((arg) => getTextWithParens(sourceCode, arg));
            replacement = `${timerCall}(${fnText}, ${delayText}, ${argsTexts.join(', ')})`;
          }
        } else {
          return;
        }

        if (replacement) {
          context.report({
            node,
            messageId: 'preferArgs',
            fix(fixer) {
              return fixer.replaceText(node, replacement);
            }
          });
        }
      }
    };
  }
});
