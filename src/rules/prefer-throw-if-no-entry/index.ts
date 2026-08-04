import { createRule } from '@/utils/create-eslint-rule';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import { ASTUtils } from '@typescript-eslint/utils';
import type { TSESLint } from '@typescript-eslint/utils';

const STAT_SYNC_NAMES = new Set(['statSync', 'lstatSync']);
type MessageIds = 'preferThrowIfNoEntry' | 'addThrowIfNoEntryOption';

function isStatSyncCallee(
  node: TSESTree.CallExpression,
  sourceCode: Readonly<TSESLint.SourceCode>
): boolean {
  const callee = node.callee;

  if (callee.type === AST_NODE_TYPES.Identifier) {
    return STAT_SYNC_NAMES.has(callee.name);
  }

  return (
    callee.type === AST_NODE_TYPES.MemberExpression
    && STAT_SYNC_NAMES.has(
      ASTUtils.getPropertyName(callee, sourceCode.getScope(callee)) ?? ''
    )
  );
}

function hasThrowIfNoEntryOption(
  node: TSESTree.CallExpression,
  sourceCode: Readonly<TSESLint.SourceCode>
): boolean {
  const options = node.arguments.at(1);
  if (options?.type !== AST_NODE_TYPES.ObjectExpression) {
    return false;
  }

  return options.properties.some(property => property.type === AST_NODE_TYPES.Property
    && ASTUtils.getPropertyName(property, sourceCode.getScope(property)) === 'throwIfNoEntry');
}

function isInTryBlockWithCatch(node: TSESTree.Node): boolean {
  let child: TSESTree.Node = node;
  let parent = node.parent;

  while (parent) {
    if (ASTUtils.isFunction(parent)) {
      return false;
    }
    if (parent.type === AST_NODE_TYPES.TryStatement) {
      if (child === parent.handler || child === parent.finalizer) {
        return false;
      }
      if (child === parent.block && parent.handler) {
        return true;
      }
    }
    child = parent;
    parent = parent.parent;
  }

  return false;
}

function buildSuggestions(
  node: TSESTree.CallExpression,
  sourceCode: Readonly<TSESLint.SourceCode>
): Array<TSESLint.SuggestionReportDescriptor<MessageIds>> {
  if (node.arguments.some((arg) => arg.type === AST_NODE_TYPES.SpreadElement)) {
    return [];
  }

  if (node.arguments.length === 1) {
    const closeParen = sourceCode.getLastToken(node);
    if (!closeParen) {
      return [];
    }
    return [
      {
        messageId: 'addThrowIfNoEntryOption',
        fix: (fixer) => fixer.insertTextBefore(closeParen, ', {throwIfNoEntry: false}')
      }
    ];
  }

  if (node.arguments.length === 2) {
    const options = node.arguments[1];
    if (options.type !== AST_NODE_TYPES.ObjectExpression) {
      return [];
    }
    if (options.properties.length === 0) {
      return [
        {
          messageId: 'addThrowIfNoEntryOption',
          fix: (fixer) => fixer.replaceText(options, '{throwIfNoEntry: false}')
        }
      ];
    }
    const lastProperty = options.properties.at(-1)!;
    return [
      {
        messageId: 'addThrowIfNoEntryOption',
        fix: (fixer) => fixer.insertTextAfter(lastProperty, ', throwIfNoEntry: false')
      }
    ];
  }

  return [];
}

export default createRule({
  name: 'prefer-throw-if-no-entry',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Prefer `{throwIfNoEntry: false}` over relying on a thrown error for missing fs entries from sync stat calls'
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      preferThrowIfNoEntry:
        'Pass { throwIfNoEntry: false } and check the return value for missing entries, keeping the try/catch for real errors like EACCES. Throwing on the common not-found path builds an expensive Error stack trace.',
      addThrowIfNoEntryOption:
        'Pass { throwIfNoEntry: false } so the call returns undefined instead of throwing.'
    }
  },
  create(context) {
    const { sourceCode } = context;

    return {
      CallExpression(node) {
        if (
          !isStatSyncCallee(node, sourceCode)
          || hasThrowIfNoEntryOption(node, sourceCode)
          || !isInTryBlockWithCatch(node)
        ) {
          return;
        }

        context.report({
          node,
          messageId: 'preferThrowIfNoEntry',
          suggest: buildSuggestions(node, sourceCode)
        });
      }
    };
  }
});
