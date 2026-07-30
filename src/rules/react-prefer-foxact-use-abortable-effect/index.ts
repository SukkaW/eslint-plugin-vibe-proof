import { createRule } from '@/utils/create-eslint-rule';
import { isSimpleTarget, walkNodes } from '@/utils/ast';
import type { EffectCallback } from '@/utils/react-hooks';
import { getEffectCallback } from '@/utils/react-hooks';
import { getTypeAware, isDefinitelyAssignableToType } from '@/utils/type-aware';
import { AST_NODE_TYPES } from '@typescript-eslint/types';
import type { TSESTree } from '@typescript-eslint/types';
import { ASTUtils } from '@typescript-eslint/utils';
import type { TSESLint } from '@typescript-eslint/utils';
import ts from 'typescript';

const FOXACT_SOURCE = 'foxact/use-abortable-effect';
const EVENT_TARGET_MESSAGE = 'Prefer `useEffect` from `foxact/use-abortable-effect` and pass its `AbortSignal` to `addEventListener` instead of manually calling `removeEventListener` in the cleanup.';

interface UseEffectImport {
  declaration: TSESTree.ImportDeclaration,
  specifier: TSESTree.ImportSpecifier,
  source: 'react' | typeof FOXACT_SOURCE
}

interface EventListenerCall {
  call: TSESTree.CallExpression,
  capture: boolean,
  eventName: TSESTree.Expression,
  listener: TSESTree.Expression,
  options: TSESTree.Expression | null,
  target: TSESTree.Expression
}

interface Cleanup {
  callback: EffectCallback,
  returnStatement: TSESTree.ReturnStatement
}

interface FixableRemoval {
  additions: EventListenerCall[],
  cleanup: Cleanup,
  statement: TSESTree.ExpressionStatement | null
}

function getUseEffectImport(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.CallExpression
): UseEffectImport | null {
  if (node.callee.type !== AST_NODE_TYPES.Identifier) return null;

  const variable = ASTUtils.findVariable(sourceCode.getScope(node.callee), node.callee);
  const definition = variable?.defs[0];
  if (
    definition?.node.type !== AST_NODE_TYPES.ImportSpecifier
    || definition.parent?.type !== AST_NODE_TYPES.ImportDeclaration
  ) {
    return null;
  }

  const { imported } = definition.node;
  const importedName = imported.type === AST_NODE_TYPES.Identifier ? imported.name : imported.value;
  if (importedName !== 'useEffect') return null;

  const importSource = definition.parent.source.value;
  if (importSource !== 'react' && importSource !== FOXACT_SOURCE) return null;

  return {
    declaration: definition.parent,
    specifier: definition.node,
    source: importSource
  };
}

function getMethodCall(
  node: TSESTree.Node,
  methodName: 'addEventListener' | 'removeEventListener'
): TSESTree.CallExpression | null {
  if (node.type !== AST_NODE_TYPES.CallExpression || node.optional) return null;
  if (
    node.callee.type !== AST_NODE_TYPES.MemberExpression
    || node.callee.optional
    || node.callee.computed
    || node.callee.property.type !== AST_NODE_TYPES.Identifier
    || node.callee.property.name !== methodName
  ) {
    return null;
  }
  return node;
}

function getPropertyName(property: TSESTree.Property): string | null {
  if (property.computed) return null;
  if (property.key.type === AST_NODE_TYPES.Identifier) return property.key.name;
  return typeof property.key.value === 'string' ? property.key.value : null;
}

function getStaticCapture(options: TSESTree.Expression | null): boolean | null {
  if (options == null) return false;

  if (options.type === AST_NODE_TYPES.Literal && typeof options.value === 'boolean') {
    return options.value;
  }

  if (options.type !== AST_NODE_TYPES.ObjectExpression) return null;

  for (let i = 0, len = options.properties.length; i < len; i++) {
    if (options.properties[i].type === AST_NODE_TYPES.SpreadElement) return null;
  }

  for (let i = options.properties.length - 1; i >= 0; i--) {
    const property = options.properties[i];
    if (property.type === AST_NODE_TYPES.SpreadElement) continue;
    if (getPropertyName(property) !== 'capture') continue;
    if (
      property.value.type !== AST_NODE_TYPES.Literal
      || typeof property.value.value !== 'boolean'
    ) {
      return null;
    }
    return property.value.value;
  }
  return false;
}

function parseEventListenerCall(
  node: TSESTree.Node,
  methodName: 'addEventListener' | 'removeEventListener'
): EventListenerCall | null {
  const call = getMethodCall(node, methodName);
  if (call == null || call.arguments.length < 2 || call.arguments.length > 3) return null;
  if (call.callee.type !== AST_NODE_TYPES.MemberExpression) return null;

  const [eventName, listener] = call.arguments;
  const options = call.arguments.length === 3 ? call.arguments[2] : null;
  if (
    eventName.type === AST_NODE_TYPES.SpreadElement
    || listener.type === AST_NODE_TYPES.SpreadElement
    || options?.type === AST_NODE_TYPES.SpreadElement
    || !isSimpleTarget(call.callee.object)
  ) {
    return null;
  }

  const capture = getStaticCapture(options);
  if (capture == null) return null;

  return {
    call,
    capture,
    eventName,
    listener,
    options,
    target: call.callee.object
  };
}

function collectCleanups(
  sourceCode: TSESLint.SourceCode,
  callback: EffectCallback
): Cleanup[] {
  if (callback.body.type !== AST_NODE_TYPES.BlockStatement) return [];

  const cleanups: Cleanup[] = [];
  walkNodes(callback.body, sourceCode.visitorKeys, (node) => {
    // Returns inside helpers belong to those functions, not to the effect.
    if (node !== callback.body && ASTUtils.isFunction(node)) return false;
    if (
      node.type === AST_NODE_TYPES.ReturnStatement
      && node.argument != null
      && (node.argument.type === AST_NODE_TYPES.ArrowFunctionExpression
        || node.argument.type === AST_NODE_TYPES.FunctionExpression)
    ) {
      cleanups.push({
        callback: node.argument,
        returnStatement: node
      });
      return false;
    }
  });
  return cleanups;
}

function collectAdditions(
  sourceCode: TSESLint.SourceCode,
  callback: EffectCallback
): EventListenerCall[] {
  const additions: EventListenerCall[] = [];
  walkNodes(callback.body, sourceCode.visitorKeys, (node) => {
    if (node !== callback.body && ASTUtils.isFunction(node)) return false;
    const addition = parseEventListenerCall(node, 'addEventListener');
    if (addition != null) additions.push(addition);
  });
  return additions;
}

function collectRemovals(cleanup: Cleanup): Array<{
  removal: EventListenerCall,
  statement: TSESTree.ExpressionStatement | null
}> {
  const { body } = cleanup.callback;
  if (body.type !== AST_NODE_TYPES.BlockStatement) {
    const removal = parseEventListenerCall(body, 'removeEventListener');
    return removal == null ? [] : [{ removal, statement: null }];
  }

  const removals: Array<{
    removal: EventListenerCall,
    statement: TSESTree.ExpressionStatement
  }> = [];
  for (let i = 0, len = body.body.length; i < len; i++) {
    const statement = body.body[i];
    if (statement.type !== AST_NODE_TYPES.ExpressionStatement) continue;
    const removal = parseEventListenerCall(statement.expression, 'removeEventListener');
    if (removal != null) removals.push({ removal, statement });
  }
  return removals;
}

function callsMatch(
  sourceCode: TSESLint.SourceCode,
  addition: EventListenerCall,
  removal: EventListenerCall
): boolean {
  return addition.capture === removal.capture
    && sourceCode.getText(addition.target) === sourceCode.getText(removal.target)
    && sourceCode.getText(addition.eventName) === sourceCode.getText(removal.eventName)
    && sourceCode.getText(addition.listener) === sourceCode.getText(removal.listener);
}

function collectIdentifierNames(
  sourceCode: TSESLint.SourceCode,
  callback: EffectCallback
): Set<string> {
  const names = new Set<string>();
  walkNodes(callback, sourceCode.visitorKeys, (node) => {
    if (node.type === AST_NODE_TYPES.Identifier) names.add(node.name);
  });
  return names;
}

function getSignalName(
  sourceCode: TSESLint.SourceCode,
  callback: EffectCallback
): { name: string, needsParameter: boolean } | null {
  if (callback.params.length === 1) {
    const [parameter] = callback.params;
    return parameter.type === AST_NODE_TYPES.Identifier
      ? { name: parameter.name, needsParameter: false }
      : null;
  }
  if (callback.params.length !== 0) return null;

  const names = collectIdentifierNames(sourceCode, callback);
  return names.has('signal')
    ? null
    : { name: 'signal', needsParameter: true };
}

function hasMatchingSignalOption(
  options: TSESTree.ObjectExpression,
  signalName: string
): boolean | null {
  for (let i = 0, len = options.properties.length; i < len; i++) {
    const property = options.properties[i];
    if (property.type === AST_NODE_TYPES.SpreadElement) continue;
    if (getPropertyName(property) !== 'signal') continue;
    return property.value.type === AST_NODE_TYPES.Identifier
      && property.value.name === signalName;
  }
  return null;
}

function canFixOptions(options: TSESTree.Expression | null, signalName: string): boolean {
  if (options == null) return true;
  if (options.type === AST_NODE_TYPES.Literal && typeof options.value === 'boolean') return true;
  if (options.type !== AST_NODE_TYPES.ObjectExpression) return false;

  const matchingSignal = hasMatchingSignalOption(options, signalName);
  if (matchingSignal != null) return matchingSignal;
  return options.properties.length > 0 || options.range[1] - options.range[0] === 2;
}

function findToken(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node,
  value: string
): TSESTree.Token | null {
  return sourceCode.getTokens(node).find((token) => token.value === value) ?? null;
}

function fixOptions(
  fixer: TSESLint.RuleFixer,
  sourceCode: TSESLint.SourceCode,
  addition: EventListenerCall,
  signalName: string
): TSESLint.RuleFix | null {
  const { options } = addition;
  const signalProperty = signalName === 'signal' ? signalName : `signal: ${signalName}`;
  if (options == null) {
    return fixer.insertTextAfter(addition.listener, `, { ${signalProperty} }`);
  }

  if (options.type === AST_NODE_TYPES.Literal && typeof options.value === 'boolean') {
    return fixer.replaceText(options, `{ capture: ${sourceCode.getText(options)}, ${signalProperty} }`);
  }

  if (options.type !== AST_NODE_TYPES.ObjectExpression) return null;
  if (hasMatchingSignalOption(options, signalName) === true) return null;

  if (options.properties.length === 0) {
    return fixer.replaceText(options, `{ ${signalProperty} }`);
  }

  const lastProperty = options.properties.at(-1)!;
  return fixer.insertTextAfter(lastProperty, `, ${signalProperty}`);
}

function getRemovalRange(
  sourceCode: TSESLint.SourceCode,
  node: TSESTree.Node
): TSESTree.Range {
  const text = sourceCode.text;
  const lineStart = text.lastIndexOf('\n', node.range[0] - 1) + 1;
  const newline = text.indexOf('\n', node.range[1]);
  const lineEnd = newline < 0 ? text.length : newline + 1;
  if (
    text.slice(lineStart, node.range[0]).trim() === ''
    && text.slice(node.range[1], newline < 0 ? text.length : newline).trim() === ''
  ) {
    return [lineStart, lineEnd];
  }
  return node.range;
}

function getImportRemovalRange(
  sourceCode: TSESLint.SourceCode,
  declaration: TSESTree.ImportDeclaration
): TSESTree.Range {
  return getRemovalRange(sourceCode, declaration);
}

function getCleanupRemovalRange(
  sourceCode: TSESLint.SourceCode,
  cleanup: TSESTree.ReturnStatement
): TSESTree.Range {
  const range = getRemovalRange(sourceCode, cleanup);
  if (range[0] === cleanup.range[0] || range[0] === 0) return range;

  const previousLineEnd = range[0] - 1;
  const previousLineStart = sourceCode.text.lastIndexOf('\n', previousLineEnd - 1) + 1;
  return sourceCode.text.slice(previousLineStart, previousLineEnd).trim() === ''
    ? [previousLineStart, range[1]]
    : range;
}

function isFinalTopLevelCleanupReturn(
  callback: EffectCallback,
  cleanup: Cleanup
): boolean {
  return callback.body.type === AST_NODE_TYPES.BlockStatement
    && cleanup.returnStatement.parent === callback.body
    && callback.body.body.at(-1) === cleanup.returnStatement;
}

function removeImportSpecifier(
  fixer: TSESLint.RuleFixer,
  sourceCode: TSESLint.SourceCode,
  hookImport: UseEffectImport
): TSESLint.RuleFix {
  const namedSpecifiers = hookImport.declaration.specifiers.filter(
    (specifier): specifier is TSESTree.ImportSpecifier => specifier.type === AST_NODE_TYPES.ImportSpecifier
  );
  const index = namedSpecifiers.indexOf(hookImport.specifier);

  if (namedSpecifiers.length > 1) {
    if (index < namedSpecifiers.length - 1) {
      return fixer.removeRange([
        hookImport.specifier.range[0],
        namedSpecifiers[index + 1].range[0]
      ]);
    }
    return fixer.removeRange([
      namedSpecifiers[index - 1].range[1],
      hookImport.specifier.range[1]
    ]);
  }

  // A named import specifier is always enclosed in braces.
  const openBrace = findToken(sourceCode, hookImport.declaration, '{')!;
  const closeBrace = findToken(sourceCode, hookImport.declaration, '}')!;
  const tokenBefore = sourceCode.getTokenBefore(openBrace);
  return fixer.removeRange([
    tokenBefore?.value === ',' ? tokenBefore.range[0] : openBrace.range[0],
    closeBrace.range[1]
  ]);
}

function addHookImportFixes(
  fixer: TSESLint.RuleFixer,
  sourceCode: TSESLint.SourceCode,
  hookImport: UseEffectImport
): TSESLint.RuleFix[] {
  if (hookImport.source === FOXACT_SOURCE) return [];

  const program = hookImport.declaration.parent;
  if (program.type !== AST_NODE_TYPES.Program) return [];

  const specifierText = sourceCode.getText(hookImport.specifier);
  const foxactImport = program.body.find((statement): statement is TSESTree.ImportDeclaration => (
    statement.type === AST_NODE_TYPES.ImportDeclaration
    && statement.source.value === FOXACT_SOURCE
  ));

  if (foxactImport == null && hookImport.declaration.specifiers.length === 1) {
    const sourceText = sourceCode.getText(hookImport.declaration.source);
    const quote = sourceText[0] === '"' ? '"' : '\'';
    return [fixer.replaceText(hookImport.declaration.source, `${quote}${FOXACT_SOURCE}${quote}`)];
  }

  const fixes: TSESLint.RuleFix[] = [];
  if (hookImport.declaration.specifiers.length === 1) {
    fixes.push(fixer.removeRange(getImportRemovalRange(sourceCode, hookImport.declaration)));
  } else {
    fixes.push(removeImportSpecifier(fixer, sourceCode, hookImport));
  }

  if (foxactImport != null) {
    const namedSpecifiers = foxactImport.specifiers.filter(
      (specifier): specifier is TSESTree.ImportSpecifier => specifier.type === AST_NODE_TYPES.ImportSpecifier
    );
    const closeBrace = findToken(sourceCode, foxactImport, '}');
    if (closeBrace != null) {
      const insertionStart = namedSpecifiers.at(-1)?.range[1]
        ?? findToken(sourceCode, foxactImport, '{')?.range[1];
      if (
        insertionStart != null
        && sourceCode.text.slice(insertionStart, closeBrace.range[0]).trim() === ''
      ) {
        fixes.push(fixer.replaceTextRange(
          [insertionStart, closeBrace.range[0]],
          namedSpecifiers.length === 0 ? ` ${specifierText} ` : `, ${specifierText} `
        ));
        return fixes;
      }
    }
  }

  fixes.push(fixer.insertTextAfter(
    foxactImport ?? hookImport.declaration,
    `\nimport { ${specifierText} } from '${FOXACT_SOURCE}';`
  ));
  return fixes;
}

function getOpeningParameterParen(
  sourceCode: TSESLint.SourceCode,
  callback: EffectCallback
): TSESTree.Token | null {
  return sourceCode.getTokens(callback).find((token) => token.value === '(') ?? null;
}

function getGlobalEventTargetType(checker: ts.TypeChecker): ts.Type | null {
  const symbol = checker.resolveName('EventTarget', undefined, ts.SymbolFlags.Type, false);
  return symbol == null ? null : checker.getDeclaredTypeOfSymbol(symbol);
}

export default createRule({
  name: 'react-prefer-foxact-use-abortable-effect',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer foxact/use-abortable-effect for EventTarget subscriptions that are manually removed in an effect cleanup.'
    },
    fixable: 'code',
    messages: {
      eventTarget: EVENT_TARGET_MESSAGE
    },
    schema: []
  },
  create(context) {
    const { sourceCode } = context;
    const typeAware = getTypeAware(sourceCode);
    const eventTargetType = typeAware == null
      ? null
      : getGlobalEventTargetType(typeAware.checker);

    return {
      CallExpression(node) {
        const hookImport = getUseEffectImport(sourceCode, node);
        if (hookImport == null) return;

        const callback = getEffectCallback(node);
        if (callback == null) return;

        const cleanups = collectCleanups(sourceCode, callback);
        if (cleanups.length === 0) return;

        const additions = collectAdditions(sourceCode, callback).filter((addition) => (
          typeAware == null
          || (eventTargetType != null && isDefinitelyAssignableToType(
            typeAware.checker,
            typeAware.getTypeAtLocation(addition.target),
            eventTargetType
          ))
        ));
        if (additions.length === 0) return;

        const matchedRemovals: FixableRemoval[] = [];
        for (let i = 0, cleanupLen = cleanups.length; i < cleanupLen; i++) {
          const cleanup = cleanups[i];
          const removals = collectRemovals(cleanup);
          for (let j = 0, removalLen = removals.length; j < removalLen; j++) {
            const { removal, statement } = removals[j];
            const matchingAdditions = additions.filter(
              (addition) => callsMatch(sourceCode, addition, removal)
            );
            if (matchingAdditions.length > 0) {
              matchedRemovals.push({
                additions: matchingAdditions,
                cleanup,
                statement
              });
            }
          }
        }
        if (matchedRemovals.length === 0) return;

        const signal = getSignalName(sourceCode, callback);
        const fixableRemovals: FixableRemoval[] = signal == null
          ? []
          : matchedRemovals.filter(({ additions: matchingAdditions }) => (
            matchingAdditions.every((addition) => canFixOptions(addition.options, signal.name))
          ));

        context.report({
          node,
          messageId: 'eventTarget',
          fix: signal == null || fixableRemovals.length === 0
            ? undefined
            : (fixer) => {
              const fixes = addHookImportFixes(fixer, sourceCode, hookImport);

              if (signal.needsParameter) {
                const openingParen = getOpeningParameterParen(sourceCode, callback);
                if (openingParen == null) return null;
                fixes.push(fixer.insertTextAfter(openingParen, signal.name));
              }

              const fixedAdditions = new Set<EventListenerCall>();
              for (let i = 0, len = fixableRemovals.length; i < len; i++) {
                const removal = fixableRemovals[i];
                for (let j = 0, addLen = removal.additions.length; j < addLen; j++) {
                  const addition = removal.additions[j];
                  if (fixedAdditions.has(addition)) continue;
                  fixedAdditions.add(addition);
                  const optionFix = fixOptions(fixer, sourceCode, addition, signal.name);
                  if (optionFix != null) fixes.push(optionFix);
                }
              }

              const removalsByCleanup = new Map<Cleanup, FixableRemoval[]>();
              for (let i = 0, len = fixableRemovals.length; i < len; i++) {
                const removal = fixableRemovals[i];
                const cleanupRemovals = removalsByCleanup.get(removal.cleanup);
                if (cleanupRemovals == null) {
                  removalsByCleanup.set(removal.cleanup, [removal]);
                } else {
                  cleanupRemovals.push(removal);
                }
              }

              for (const [cleanup, cleanupRemovals] of removalsByCleanup) {
                const cleanupBody = cleanup.callback.body;
                const becomesEmpty = cleanupBody.type !== AST_NODE_TYPES.BlockStatement
                  || cleanupBody.body.every((statement) => (
                    cleanupRemovals.some((removal) => removal.statement === statement)
                  ));

                if (becomesEmpty) {
                  if (isFinalTopLevelCleanupReturn(callback, cleanup)) {
                    fixes.push(fixer.removeRange(getCleanupRemovalRange(sourceCode, cleanup.returnStatement)));
                  } else {
                    fixes.push(fixer.replaceText(cleanup.returnStatement, 'return;'));
                  }
                  continue;
                }

                for (let i = 0, len = cleanupRemovals.length; i < len; i++) {
                  const statement = cleanupRemovals[i].statement;
                  if (statement != null) {
                    fixes.push(fixer.removeRange(getRemovalRange(sourceCode, statement)));
                  }
                }
              }

              return fixes;
            }
        });
      }
    };
  }
});
