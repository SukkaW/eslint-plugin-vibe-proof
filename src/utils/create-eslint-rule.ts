import type { TSESLint, ParserServices, ParserServicesWithTypeInformation } from '@typescript-eslint/utils';

export type { RuleContext } from '@typescript-eslint/utils/ts-eslint';

interface Metadata<MessageIDs extends string, PluginDocs = unknown> extends TSESLint.RuleMetaData<MessageIDs, PluginDocs & { recommended?: TSESLint.RuleRecommendation }> {
  hidden?: boolean
}

export interface RuleModule<
  TResolvedOptions,
  TOptions extends readonly unknown[],
  TMessageIDs extends string,
  TMetaDocs = unknown
> {
  readonly name: string,
  readonly meta: Metadata<TMessageIDs, TMetaDocs>,
  resolveOptions?(this: void, ...options: TOptions): TResolvedOptions,
  create(this: void, context: Readonly<TSESLint.RuleContext<TMessageIDs, TOptions>>, options: TResolvedOptions): TSESLint.RuleListener
}

export interface ExportedRuleModule<
  TOptions extends readonly unknown[] = unknown[],
  TMessageIDs extends string = string
> {
  readonly name: string,
  readonly meta: Metadata<TMessageIDs>,
  create(context: Readonly<TSESLint.RuleContext<TMessageIDs, TOptions>>): TSESLint.RuleListener
}

export function createRule<
  TResolvedOptions,
  TOptions extends unknown[],
  TMessageIDs extends string,
  PluginDocs = unknown
>({ name, meta, create, resolveOptions }: RuleModule<TResolvedOptions, TOptions, TMessageIDs, PluginDocs>): ExportedRuleModule<TOptions, TMessageIDs> {
  return {
    name,
    meta,
    create(context) {
      const options = resolveOptions?.(...context.options) ?? (context.options[0] as TResolvedOptions);
      const listener = Object.entries(create(context, options));
      return listener.reduce<TSESLint.RuleListener>((result, [selector, handler]) => {
        if (handler) {
          result[selector] = handler;
        }
        return result;
      }, {});
    }
  } satisfies ExportedRuleModule<TOptions, TMessageIDs>;
}

export function isParserWithTypeInformation(
  parserServices: Partial<ParserServices> | undefined
): parserServices is ParserServicesWithTypeInformation {
  return !!parserServices?.program;
}

export function ensureParserWithTypeInformation(
  parserServices: Partial<ParserServices> | undefined
): asserts parserServices is ParserServicesWithTypeInformation {
  if (!parserServices?.program) {
    throw new Error('It seems that you have not enabled type information for ESLint. See https://typescript-eslint.io/getting-started/typed-linting for more information.');
  }
}
export type SourceCodeWithScopeManager = TSESLint.SourceCode & { scopeManager: TSESLint.Scope.ScopeManager };

export function isSourceCodeWithScopeManager(
  sourceCode: TSESLint.SourceCode
): sourceCode is SourceCodeWithScopeManager {
  return !!sourceCode.scopeManager;
}
